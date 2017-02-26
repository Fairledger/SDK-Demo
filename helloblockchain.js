process.env.GOPATH = __dirname;

var hfc = require('hfc');
var util = require('util');
var fs = require('fs');
// Body parser for parsing the request body
var express = require("express"),
		app = express(),
	  bodyParser = require("body-parser"),
		path = require("path");

// Debug modules to aid with debugging
var debugModule = require('debug');
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

var uuid = require('node-uuid');

var newUserName;
var caUrl;
var peerUrls = [];
var EventUrls = [];
var registeredUsers = [];

app.use( bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
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
	var user_name = req.query.user;

	console.log("\nRequesting to enroll user " + user_name);

	if (user_name == undefined) {
		res.send("ERROR: undefined username");
		return;
	}

	var retval = "NA";

	console.log("trying to enroll " + user_name);
	
	retval = enrollUser(user_name, function(retval) {
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
	var state_name = req.query.name;

	if (state_name == "num_users") {
		res.send("Number of registered users: " + registeredUsers.length);
		return;
	}

	var app_user = 'None';

	// Construct the query request
	var queryRequest = {
		// Name (hash) required for query
		chaincodeID: chaincodeID,
		// Function to trigger
		fcn: "query_reg_users",
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
// Create Contract invoke request
//
app.get('/contract', function(req, res) {
	// Amount to transfer
	var transaction = req.query.transaction;
	var username = req.query.user;
	var product = req.query.product;
	var quantity_lbs = req.query.quantity;
	var amount_dollars = req.query.amount;
	var maxtempC = req.query.maxtempC;

	console.log("Received transaction: " + transaction);
	console.log("user: " + username);

	if (!fileExists(chaincodeIDPath)){
		console.log("Chaincode does not exist");
		res.status(500).json({ error: "Chaincode does not exist" });
	}

	chaincodeID = fs.readFileSync(chaincodeIDPath, 'utf8');
	console.log("ccccchanid: "+chaincodeID);
        
//	chain.getUser(username, function(err, userObj) {
//		if (err) {
//			console.log("User " + username + "not	registered and enrolled: " + err);
//			res.status(500).json({ error: err });
//		}

		app_user = userObj;
		var contractID = uuid.v1();

		// Construct the invoke request
		var invokeRequest = {
			// Name (hash) required for invoke
			chaincodeID: chaincodeID,
			// Function to trigger
			fcn: "init_contract_terms",
			// Parameters for the invoke function
			args: [contractID, product, quantity_lbs, amount_dollars, maxtempC]
		};

		var retstatus = 200;
		invoke(invokeRequest, username, function(err, retstatus) {
			if(err) {
				console.log("Failed to Invoke Request");
				res.status(500).json({error: err});
			}
			//res.status(200).json({ status: "Created contract ID: " + contraceID});
			ret = "Created contract ID: " + contractID;
			console.log(ret);
			res.send(ret);
		});
	
});

//
// Create Contract invoke request
//
app.get('/loc', function(req, res) {
	// Amount to transfer
	var transaction = req.query.transaction;
	var username = req.query.user;
	var contractID = req.query.contractID;
	var value_dollars = req.query.value;
	var exporter = req.query.exporter;
	var importer = req.query.importer;
	var customs = req.query.customs;
	var port_loading = req.query.port_loading;
	var port_entry = req.query.port_entry;

	console.log("Received transaction: " + transaction);
	console.log("user: " + username);

	if (!fileExists(chaincodeIDPath)){
		console.log("Chaincode does not exist");
		res.status(500).json({ error: "Chaincode does not exist" });
	}

	chaincodeID = fs.readFileSync(chaincodeIDPath, 'utf8');
        
	chain.getUser(username, function(err, userObj) {
		if (err) {
			console.log("User " + username + "not	registered and enrolled: " + err);
			res.status(500).json({ error: err });
		}

		app_user = userObj;
		var locID = uuid.v1();

		// Construct the invoke request
		var invokeRequest = {
			// Name (hash) required for invoke
			chaincodeID: chaincodeID,
			// Function to trigger
			fcn: "create_loc",
			// Parameters for the invoke function
			args: [locID, contractID, value_dollars, exporter, importer, customs, port_loading, port_entry]
		};

		var retstatus = 200;
		invoke(invokeRequest, username, function(err, retstatus) {
			if(err) {
				console.log("Failed to Invoke Request");
				res.status(500).json({error: err});
			}
			//res.status(200).json({ status: "Created contract ID: " + contraceID});
			ret = "Created LOC: " + locID;
			console.log(ret);
			res.send(ret);
		});
	});
	
});

app.get('/ship', function(req, res) {
	// Amount to transfer
	var transaction = req.query.transaction;
	var username = req.query.user;
	var contractID = req.query.contractID;
	var value_dollars = req.query.value;
	var cargo_temp_c = req.query.cargo_temp_c;
	var shipper = req.query.shipper;
	var start_location = req.query.location;
	var ship_activity = req.query.ship_activity;

	console.log("Received transaction: " + transaction);
	console.log("user: " + username);
	console.log("user: " + contractID);
	console.log("user: " + value_dollars);

	if (!fileExists(chaincodeIDPath)){
		console.log("Chaincode does not exist");
		res.status(500).json({ error: "Chaincode does not exist" });
	}

	chaincodeID = fs.readFileSync(chaincodeIDPath, 'utf8');
        
	chain.getUser(username, function(err, userObj) {
		if (err) {
			console.log("User " + username + "not	registered and enrolled: " + err);
			res.status(500).json({ error: err });
		}

		app_user = userObj;
		var shipmentID = uuid.v1();

		// Construct the invoke request
		var invokeRequest = {
			// Name (hash) required for invoke
			chaincodeID: chaincodeID,
			// Function to trigger
			fcn: "shipment_activity",
			// Parameters for the invoke function
			args: [shipmentID, contractID, value_dollars, cargo_temp_c, shipper, start_location, ship_activity]
		};

		var retstatus = 200;
		invoke(invokeRequest, username, function(err, retstatus) {
			if(err) {
				console.log("Failed to Invoke Request");
				res.status(500).json({error: err});
			}
			//res.status(200).json({ status: "Created contract ID: " + contraceID});
			ret = "Created Shipment Activity: " + shipmentID;
			console.log(ret);
			res.send(ret);
		});
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

function enrollUser(user_name, retstr){
    // Enroll a 'admin' who is already registered because it is
    // listed in fabric/membersrvc/membersrvc.yaml with it's one time password.
		// getMember tries to get the member 
		webAppAdmin_ID = users[1].enrollId;
		webAppAdmin_secret = users[1].enrollSecret;
		chain.enroll(users[1].enrollId, users[1].enrollSecret, function(err, WebAppAdmin) {
			if (err) {
				console.log("ERROR: Faield to enroll WebAppAdmin member -- "+err);
				retstr( "Failed to get member WebAppAdmin");
			} else {

				console.log("Successfully enrolled WebAppAdmin member");

				console.log("Setting WebAppAdmin as chain registrar for "+ user_name);
				chain.setRegistrar(WebAppAdmin);

				// Register and enroll a new user with the Admin as the chain registrar
				enrollAndRegisterUser(user_name, function(ret ) {
					console.log("enrollUser resp: "+ret);
					retstr(ret);
				});
			}
		});
}

//
// Register and enroll a new user with the certificate authority.
// This will be performed by the member with registrar authority, WebAppAdmin.
//
function enrollAndRegisterUser(user_name, retstr) {

    //creating a new user
    var registrationRequest = {
        enrollmentID: user_name,
        affiliation: config.user.affiliation
    };

		console.log("Now enrolling: " + user_name);
    chain.registerAndEnroll(registrationRequest, function(err, user) {
      if (err) {
				ret = "Failed to register and enroll " + user_name + ": " + err;
				console.log("\n" + ret);
				retstr(ret);
			}

			console.log("Successfully registered/enrolled user: ", user_name);

			registeredUsers.push(user_name);

						
			if (fileExists(chaincodeIDPath)) {
				retstr("Chaincode already initialized, calling INIT for user: ", user_name);
				console.log(util.format("\nCalling INIT for ", user_name));
        chaincodeID = fs.readFileSync(chaincodeIDPath, 'utf8');
        chain.getUser(newUserName, function(err, user) {
            if (err) {
							userObj = user;
							invoke_init_userstate(user_name, function(invokeresp) {
								console.log("enrollAndRegisterUser(): invoke: "+invokeresp);
								retstr(invokeresp);
							});
						} else {
							retstr("User " + user_name +" is already initialized");
						}
				});
			} else {
        //setting timers for fabric waits
        chain.setDeployWaitTime(config.deployWaitTime);
				console.log("Deploying new chaincode on the Blockchain...");
				deployChaincode(user_name, user, function(deployresp) {
					console.log("enrollAndRegisterUser(): deployed: "+deployresp);
					retstr(deployresp);
				});
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


function deployChaincode(user_name, userObj, retstr) {
    //var args = getArgs(config.deployRequest);
    // Construct the deploy request
    var deployRequest = {
        // Function to trigger
        fcn: config.deployRequest.functionName,
        // Arguments to the initializing function
        args: [user_name, "0"],
        chaincodePath: config.deployRequest.chaincodePath,
        // the location where the startup and HSBN store the certificates
        certificatePath: network.cert_path
    };

    // Trigger the deploy transaction
		console.log("Deploying now for user");
    var deployTx = userObj.deploy(deployRequest);

    // Print the deploy results
    deployTx.on('complete', function(results) {
        // Deploy request completed successfully
        chaincodeID = results.chaincodeID;
        console.log("\nChaincode ID : " + chaincodeID);
        console.log(util.format("\nSuccessfully deployed chaincode: request=%j, response=%j", deployRequest, results));
        // Save the chaincodeID
        fs.writeFileSync(chaincodeIDPath, chaincodeID);
				rstr = "Successfully initialized the chaincode";
				retstr(rstr);
    });

    deployTx.on('error', function(err) {
        // Deploy request failed
        console.log(util.format("\nFailed to deploy chaincode: request=%j, error=%j", deployRequest, err));
        process.exit(1);
				rtstr = "Failed to initialize the chaincode";
				retstr(rstr);
				;
    });
}

function invoke(invokeRequest, username, retstr) {
		console.log("In invoke(): ");
    var eh = chain.getEventHub();

		chain.getUser(username, function(err, userObj) {
			if (err) {
				console.log("User " + username + "not	registered and enrolled: " + err);
				retstr("User "+ username + "failed to register/enroll: "+ err);
			}

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
					retstr(null, "OK");
				 // query();
			});
			invokeTx.on('error', function(err) {
					// Invoke transaction submission failed
					console.log(util.format("\nFailed to submit chaincode invoke transaction: request=%j, error=%j", invokeRequest, err));
					retstr(err);
			});
		});

    //Listen to custom events
    var regid = eh.registerChaincodeEvent(chaincodeID, "evtsender", function(event) {
        console.log(util.format("Custom event received, payload: %j\n", event.payload.toString()));
        eh.unregisterChaincodeEvent(regid);
    });

}

function invoke_init_userstate(user_name, retstat) {
    var eh = chain.getEventHub();
    // Construct the invoke request
    var invokeRequest = {
        // Name (hash) required for invoke
        chaincodeID: chaincodeID,
        // Function to trigger
        fcn: "init",
        // Parameters for the invoke function
        args: [user_name, "0.00"] 
    };

		console.log("Initialize balance for " + user_name + " to $0.00");
		invoke(invokeRequest, user_name, function(invokeresp) {
				retstat(invokeresp);
		});
}

function query(user_name) {
    var args = getArgs(config.queryRequest);
    // Construct the query request
    var queryRequest = {
        // Name (hash) required for query
        chaincodeID: chaincodeID,
        // Function to trigger
        fcn: "query",
        // Existing state variable to retrieve
        args: [user_name]
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
