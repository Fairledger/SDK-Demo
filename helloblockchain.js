process.env.GOPATH = __dirname;

var hfc = require('hfc');
var util = require('util');
var fs = require('fs');
// Body parser for parsing the request body
var bodyParser = require('body-parser')
// Debug modules to aid with debugging
var debugModule = require('debug');
var express = require("express");
var app = express();
const https = require('https');

var config;
var chain;
var network;
var certPath;
var peers;
var users;
var userObj;
var userAdminObj;
var userAdmin;
var farmerUser;
var farmerObj;
var chaincodeID;
var certFile = 'us.blockchain.ibm.com.cert';
var chaincodeIDPath = __dirname + "/chaincodeID";


var caUrl;
var peerUrls = [];
var EventUrls = [];
var registeredUsers = {};

app.jsonParser = bodyParser.json();
app.urlencodedParser = bodyParser.urlencoded({ extended: true });
app.configure(function () {
	app.use(
		"/", // the URL throught which you want to access to you static content
        express.static(__dirname) //where your static content is located in your filesystem
    );

	// Enable CORS for ease of development and testing
	app.use(function(req, res, next) {
		res.header("Access-Control-Allow-Origin", "*");
		res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
		next();
	});


	// Use body-parer to parse the JSON formatted request payload
	app.use(bodyParser.json());
});

init();
startListener();

app.get("/", function(req, res) {
	console.log("Hi There ");
	res.send("Welcome to FairLedger Supply Chain Blockchain");
});

//
// Register and Enroll Users
//
app.get("/enroll", function(req, res) {
	//var user_name = req.query.user;
	console.log("body: ", res.body);
	var user_name = req.query.user;

	console.log("\nRequesting to enroll user " + user_name);

	var retval = "NA";

	console.log("trying to enroll " + user_name);
	
	enrollUser(user_name, function(retval) {
		console.log("response: " + retval);
		res.send(retval);
	});
});

//
// Add route for a chaincode query request for a specific state variable
//
app.get("/state", function(req, res) {
	// State variable to retrieve
	var app_user_name = req.query.user;
	var stateVar = req.query.parm;
	var app_user = 'None';

	for(var reguser =0; reguser < registeredUsers.length; reguser++) {
		if (reguser['user_id'] == app_user_name) {
			app_user = reguser['userObj'];
		}
	}

	if (app_user in registeredUsers) {
		retstr = "User %s is not registered & enrolled" % app_user_name;
		console.log(retstr);
		res.send(retstr);
	} else {
		console.log("User %s not found so exiting" % app_user_name);
		process.exit();
	}

	// Construct the query request
	var queryRequest = {
		// Name (hash) required for query
		chaincodeID: chaincodeID,
		// Function to trigger
		fcn: "query",
		// State variable to retrieve
		args: [stateVar]
	};

	// Trigger the query transaction
	var queryTx = app_user.query(queryRequest);

	// Query completed successfully
	queryTx.on('complete', function (results) {
		console.log(util.format("Successfully queried existing chaincode state: " +
		"request=%j, response=%j, value=%s", queryRequest, results, results.result.toString()));

		res.status(200).json({ "value": results.result.toString() });
	});
	// Query failed
	queryTx.on('error', function (err) {
		var errorMsg = util.format("ERROR: Failed to query existing chaincode " +
		"state: request=%j, error=%j", queryRequest, err);

		console.log(errorMsg);

		res.status(500).json({ error: errorMsg });
	});
});

//
// Add route for a chaincode invoke request
//
app.post('/transactions', function(req, res) {
	// Amount to transfer
	var amount = req.body.amount;

	// Construct the invoke request
	var invokeRequest = {
		// Name (hash) required for invoke
		chaincodeID: chaincodeID,
		// Function to trigger
		fcn: "invoke",
		// Parameters for the invoke function
		args: ["account", amount]
	};

	// Trigger the invoke transaction
	var invokeTx = app_user.invoke(invokeRequest);

	// Invoke transaction submitted successfully
	invokeTx.on('submitted', function (results) {
		console.log(util.format("Successfully submitted chaincode invoke " +
		"transaction: request=%j, response=%j", invokeRequest, results));

		res.status(200).json({ status: "submitted" });
	});
	// Invoke transaction submission failed
	invokeTx.on('error', function (err) {
		var errorMsg = util.format("ERROR: Failed to submit chaincode invoke " +
		"transaction: request=%j, error=%j", invokeRequest, err);

		console.log(errorMsg);

		res.status(500).json({ error: errorMsg });
	});
});

function startListener() {
	var port = process.env.PORT || 5000;
	console.log("Starting WebApp on port: " + port);
	app.listen(port, function() {
		console.log("WebApp is now Listening on " + port + "\n");
	});
}

function init() {
    try {
        config = JSON.parse(fs.readFileSync(__dirname + '/config.json', 'utf8'));
    } catch (err) {
        console.log("config.json is missing or invalid file, Rerun the program with right file")
        process.exit();
    }

    // Create a client blockchin.
    //chain = hfc.newChain(config.chainName);
    chain = hfc.getChain(config.chainName, true);

    //path to copy the certificate
    certPath = __dirname + "/src/" + config.deployRequest.chaincodePath + "/certificate.pem";

    // Read and process the credentials.json
    try {
        network = JSON.parse(fs.readFileSync(__dirname + '/ServiceCredentials.json', 'utf8'));
        if (network.credentials) network = network.credentials;
    } catch (err) {
        console.log("ServiceCredentials.json is missing or invalid file, Rerun the program with right file")
        process.exit();
    }

    peers = network.peers;
    users = network.users;
		console.log("User web app admin: ", users[1]);

		setup();

    printNetworkDetails();
		
//		listenForUserRequests();

}

function setup() {
    // Determining if we are running on a startup or HSBN network based on the url
    // of the discovery host name.  The HSBN will contain the string zone.
    var isHSBN = peers[0].discovery_host.indexOf('secure') >= 0 ? true : false;
    var network_id = Object.keys(network.ca);
    caUrl = "grpcs://" + network.ca[network_id].discovery_host + ":" + network.ca[network_id].discovery_port;

    // Configure the KeyValStore which is used to store sensitive keys.
    // This data needs to be located or accessible any time the users enrollmentID
    // perform any functions on the blockchain.  The users are not usable without
    // This data.
    var uuid = network_id[0].substring(0, 8);
    chain.setKeyValStore(hfc.newFileKeyValStore(__dirname + '/keyValStore-' + uuid));

    if (isHSBN) {
        certFile = '0.secure.blockchain.ibm.com.cert';
    }
    fs.createReadStream(certFile).pipe(fs.createWriteStream(certPath));
    var cert = fs.readFileSync(certFile);

		// This determines if member services is present.  MemberServices when it starts up
		// automatically enrolls users that are listed in the memberserives.yaml file.
		// Otherwise it requires a registrar type user that has priviledges to register clients
    // Only users with a 'registrar' section may be a registrar to register other users.  In particular,
	  // 1) the "roles" field specifies which member roles may be registered by this user, and
		// 2) the "delegateRoles" field specifies which member roles may become the "roles" field of registered users.
		// The valid role names are "client", "peer", "validator", and "auditor".
    // Example1:
		//   The 'admin' user below can register clients, peers, validators, or auditors; furthermore, the 
		//   'admin' user can register other users who can then register clients only.
		// Example2:
		//   The 'WebAppAdmin' user below can register clients only, but none of the users registered by 
		//   this user can register other users.
		// 
    chain.setMemberServicesUrl(caUrl, {
        pem: cert
    });

    peerUrls = [];
    eventUrls = [];
    // Adding all the peers to blockchain
    // this adds high availability for the client
    for (var i = 0; i < peers.length; i++) {
        // Peers on Bluemix require secured connections, hence 'grpcs://'
        peerUrls.push("grpcs://" + peers[i].discovery_host + ":" + peers[i].discovery_port);
        chain.addPeer(peerUrls[i], {
            pem: cert
        });
        eventUrls.push("grpcs://" + peers[i].event_host + ":" + peers[i].event_port);
        chain.eventHubConnect(eventUrls[0], {
            pem: cert
        });
    }
    newUserName = config.user.username;
    // Make sure disconnect the eventhub on exit
    process.on('exit', function() {
        chain.eventHubDisconnect();
    });
}

function enrollUser(user_name){
    // Enroll a 'admin' who is already registered because it is
    // listed in fabric/membersrvc/membersrvc.yaml with it's one time password.
		// getMember tries to get the member 
		chain.getMember(users[1].enrollId, function(err, WebAppAdmin) {
			if (err) {
				console.log("ERROR: Faield to get WebAppAdmin member -- "+err);
				retstr = "Failed to get member WebAppAdmin";
				return retstr;
			} else {
				webAppAdmin_ID = users[1].enrollId;
				webAppAdmin_secret = users[1].enrollSecret;

				console.log("Successfully got WebAppAdmin member");

				if (WebAppAdmin.isEnrolled()) {
					retstr = "WebAppAdmin "+ webAppAdmin_ID +" is already enrolled";
				}
			
				if (WebAppAdmin.isRegistered()) {
					console.log("User "+ webAppAdmin_ID + " is already registered but not enrolled.");
				}	

				// This will enroll the Admin user if it's not already enrolled.  Then it will
				// register/enroll the new user
				chain.enroll(webAppAdmin_ID, webAppAdmin_secret, function(err, WebAppAdmin) {
					if (err) {
						console.log("\nERROR: failed to enroll WebAppAdmin : " + err);
						retstr = "Failed to enroll WebAppAdmin member";
						return retstr;
					} else {
						// Set this user as the chain's registrar which is authorized to register other users.
						console.log("\nEnrolled WebAppAdmin sucecssfully");
						console.log("Setting WebAppAdmin as chain registrar.");
						chain.setRegistrar(WebAppAdmin);

						// Register and enroll a new user with the Admin as the chain registrar
						enrollAndRegisterUser(user_name);
	
					}
				});
			}
		});
}

//
// Register and enroll a new user with the certificate authority.
// This will be performed by the member with registrar authority, WebAppAdmin.
//
function enrollAndRegisterUser(user_name) {

    //creating a new user
    var registrationRequest = {
        enrollmentID: user_name,
        affiliation: config.user.affiliation
    };

    chain.registerAndEnroll(registrationRequest, function(err, user) {
      if (err) {
				retstr = "Failed to register and enroll " + user_name;
				console.log("\n" + retstr + ": " + err);
				return retstr;
			}

			registeredUsers[user_name] = user;

			retstr = "Enrolled and registered " + user_name + " successfully";
      console.log("\n" + retstr);
						
			if (fileExists(chaincodeIDPath)) {
				console.log("Chaincode already initialized");
			} else {
        //setting timers for fabric waits
        //chain.setDeployWaitTime(config.deployWaitTime);
				console.log("Deploying new chaincode on the Blockchain...");
				deployChaincode(user);
			}
   });
}

function printNetworkDetails() {
    console.log("\n------------- ca-server, peers and event URL:PORT information: -------------");
    console.log("\nCA server Url : %s\n", caUrl);
    for (var i = 0; i < peerUrls.length; i++) {
        console.log("Validating Peer%d : %s", i, peerUrls[i]);
    }
    console.log("");
    for (var i = 0; i < eventUrls.length; i++) {
        console.log("Event Url on Peer%d : %s", i, eventUrls[i]);
    }
    console.log("");
    console.log('-----------------------------------------------------------\n');
}


function deployChaincode(userObj) {
    var args = getArgs(config.deployRequest);
    // Construct the deploy request
    var deployRequest = {
        // Function to trigger
        fcn: config.deployRequest.functionName,
        // Arguments to the initializing function
        args: args,
        chaincodePath: config.deployRequest.chaincodePath,
        // the location where the startup and HSBN store the certificates
        certificatePath: network.cert_path
    };

    // Trigger the deploy transaction
    var deployTx = userObj.deploy(deployRequest);

    // Print the deploy results
    deployTx.on('complete', function(results) {
        // Deploy request completed successfully
        chaincodeID = results.chaincodeID;
        console.log("\nChaincode ID : " + chaincodeID);
        console.log(util.format("\nSuccessfully deployed chaincode: request=%j, response=%j", deployRequest, results));
        // Save the chaincodeID
        fs.writeFileSync(chaincodeIDPath, chaincodeID);
				retstr = "Successfully initialized the chaincode";
				return retstr;
    });

    deployTx.on('error', function(err) {
        // Deploy request failed
        console.log(util.format("\nFailed to deploy chaincode: request=%j, error=%j", deployRequest, err));
        process.exit(1);
				retstr = "Failed to initialize the chaincode";
				return retstr;
    });
}

function invoke() {
    var args = getArgs(config.invokeRequest);
    var eh = chain.getEventHub();
    // Construct the invoke request
    var invokeRequest = {
        // Name (hash) required for invoke
        chaincodeID: chaincodeID,
        // Function to trigger
        fcn: config.invokeRequest.functionName,
        // Parameters for the invoke function
        args: args
    };

    // Trigger the invoke transaction
    var invokeTx = userObj.invoke(invokeRequest);

    // Print the invoke results
    invokeTx.on('submitted', function(results) {
        // Invoke transaction submitted successfully
        console.log(util.format("\nSuccessfully submitted chaincode invoke transaction: request=%j, response=%j", invokeRequest, results));
    });
    invokeTx.on('complete', function(results) {
        // Invoke transaction completed successfully
        console.log(util.format("\nSuccessfully completed chaincode invoke transaction: request=%j, response=%j", invokeRequest, results));
        query();
    });
    invokeTx.on('error', function(err) {
        // Invoke transaction submission failed
        console.log(util.format("\nFailed to submit chaincode invoke transaction: request=%j, error=%j", invokeRequest, err));
        process.exit(1);
    });

    //Listen to custom events
    var regid = eh.registerChaincodeEvent(chaincodeID, "evtsender", function(event) {
        console.log(util.format("Custom event received, payload: %j\n", event.payload.toString()));
        eh.unregisterChaincodeEvent(regid);
    });
}

function invoke_loc() {
    var args = getArgs(config.invoke_loc);
    var eh = chain.getEventHub();
    // Construct the invoke request
    var invokeRequest = {
        // Name (hash) required for invoke
        chaincodeID: chaincodeID,
        // Function to trigger
        fcn: config.invoke_loc.functionName,
        // Parameters for the invoke function
        args: args
    };

    // Trigger the invoke transaction
    var invokeTx = userObj.invoke(invokeRequest);

    // Print the invoke results
    invokeTx.on('submitted', function(results) {
        // Invoke transaction submitted successfully
        console.log(util.format("\nSuccessfully submitted chaincode invoke transaction: request=%j, response=%j", invokeRequest, results));
    });
    invokeTx.on('complete', function(results) {
        // Invoke transaction completed successfully
        console.log(util.format("\nSuccessfully completed chaincode invoke transaction: request=%j, response=%j", invokeRequest, results));
        query();
    });
    invokeTx.on('error', function(err) {
        // Invoke transaction submission failed
        console.log(util.format("\nFailed to submit chaincode invoke transaction: request=%j, error=%j", invokeRequest, err));
        process.exit(1);
    });

    //Listen to custom events
    var regid = eh.registerChaincodeEvent(chaincodeID, "evtsender", function(event) {
        console.log(util.format("Custom event received, payload: %j\n", event.payload.toString()));
        eh.unregisterChaincodeEvent(regid);
    });
}

function query() {
    var args = getArgs(config.queryRequest);
    // Construct the query request
    var queryRequest = {
        // Name (hash) required for query
        chaincodeID: chaincodeID,
        // Function to trigger
        fcn: config.queryRequest.functionName,
        // Existing state variable to retrieve
        args: args
    };

    // Trigger the query transaction
    var queryTx = userObj.query(queryRequest);

    // Print the query results
    queryTx.on('complete', function(results) {
        // Query completed successfully
        console.log("\nSuccessfully queried  chaincode function: request=%j, value=%s", queryRequest, results.result.toString());
        process.exit(0);
    });
    queryTx.on('error', function(err) {
        // Query failed
        console.log("\nFailed to query chaincode, function: request=%j, error=%j", queryRequest, err);
        process.exit(1);
    });
}

function getArgs(request) {
    var args = [];
    for (var i = 0; i < request.args.length; i++) {
        args.push(request.args[i]);
    }
    return args;
}

function fileExists(filePath) {
    try {
        return fs.statSync(filePath).isFile();
    } catch (err) {
        return false;
    }
}
