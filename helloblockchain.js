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
	var init_balance = req.query.balance;
	var bank = req.query.user_bank;
	var user_affiliation = req.query.user_affil;

	console.log("\nRequesting to enroll user: " + user_name + " affil: " + user_affiliation + " bank: "+ bank);

	if (user_name == undefined) {
		res.send("ERROR: undefined username");
		return;
	}

	if (user_name == "" || user_affiliation == "" || bank == ""){
		res.send("ERROR: undefined username or bank affiliation");
		return;
	}

	var retval = "NA";

	console.log("Initialize: " + user_name + " bank: " + user_affiliation + " balance: " + init_balance, " bank: " + bank);
	
	retval = enrollUser(user_name, user_affiliation, init_balance, bank, function(retval) {
		console.log("response: " + retval);
		res.send(retval);
	});
});

//
// Add route for a chaincode query request for a specific state variable
//
app.get("/state", function(req, res) {
	// State variable to retrieve
	var username = req.query.user;
	var docType = req.query.doctype;
	var docID = req.query.docID;

//	if (state_name == "num_users") {
//		res.send("Number of registered users: " + registeredUsers.length);
//		return;
//	}

	console.log("\nReceived query request");

	if (!fileExists(chaincodeIDPath)){
		console.log("Chaincode does not exist");
		res.status(500).json({ error: "Chaincode does not exist" });
	}

	chaincodeID = fs.readFileSync(chaincodeIDPath, 'utf8');
	console.log("chaincodeID: "+chaincodeID);
        
	var app_user = 'None';
	query(username, docType, docID, function(retstatus, err) {
		if(err) {
			console.log("Failed to Invoke Request");
			res.status(500).json({error: err});
		}
		//res.status(200).json({ status: "Created contract ID: " + contraceID});
		console.log("query resp: " + retstatus);
		res.send(retstatus);
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

	console.log("\nReceived transaction: " + transaction);
	console.log("user: " + username);

	if (!fileExists(chaincodeIDPath)){
		console.log("Chaincode does not exist");
		res.status(500).json({ error: "Chaincode does not exist" });
	}

	chaincodeID = fs.readFileSync(chaincodeIDPath, 'utf8');
	console.log("chaincodeID: "+chaincodeID);
        
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
		invoke(invokeRequest, username, function(retstatus, err) {
			if(err) {
				console.log("Failed to Invoke Request");
				res.status(500).json({error: err});
			}
			//res.status(200).json({ status: "Created contract ID: " + contraceID});
			console.log(retstatus);
			res.send(retstatus);
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
	var exporter_bank = req.query.exporter_bank;
	var importer = req.query.importer;
	var importer_bank = req.query.importer_bank;
	var shippingCo = req.query.shipper
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
			args: [locID, contractID, value_dollars, exporter, exporter_bank, importer, importer_bank, shippingCo, customs, port_loading, port_entry]
		};

		var retstatus = 200;
		invoke(invokeRequest, username, function(retstatus, err) {
			if(err) {
				console.log("Failed to Invoke Request");
				res.status(500).json({error: err});
			}
			//res.status(200).json({ status: "Created contract ID: " + contraceID});
			console.log(retstatus);
			res.send(retstatus);
		});
	});
	
});

app.get('/ship', function(req, res) {
	// Amount to transfer
	var transaction = req.query.transaction;
	var username = req.query.user;
	var contractID = req.query.contractID;
	var value_dollars = req.query.value;
	var cargo_temp_c = req.query.cargo_tempC;
	var shippingCo = req.query.shippingCo;
	var start_location = req.query.start_location;
	var ship_activity = req.query.ship_event;

	console.log("Received transaction: " + transaction);
	console.log("user: " + username);
	console.log("contractID: " + contractID);
	console.log("value: " + value_dollars);
	console.log("cargotemp: " + cargo_temp_c);
	console.log("shippingCo: " + shippingCo);
	console.log("start_location: " + start_location);
	console.log("activity: " + ship_activity);

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
		console.log("shipid: " +shipmentID);

		// Construct the invoke request
		var invokeRequest = {
			// Name (hash) required for invoke
			chaincodeID: chaincodeID,
			// Function to trigger
			fcn: "shipment_activity",
			// Parameters for the invoke function
			args: [shipmentID, contractID, value_dollars, cargo_temp_c, shippingCo, start_location, ship_activity]
		};

		console.log("ship request: " + invokeRequest);
		var retstatus = 200;
		invoke(invokeRequest, username, function(retstatus, err) {
			if(err) {
				console.log("Failed to Invoke Request");
				res.status(500).json({error: err});
			}
			//res.status(200).json({ status: "Created contract ID: " + contraceID});
			console.log(retstatus);
			res.send(retstatus);
		});
	});
	
});
//
// Transfer Funds invoke request
//
app.get('/transfer', function(req, res) {
	// Amount to transfer
	var transaction = req.query.transaction;
	var contractID = req.query.contractID;
	var payer = req.query.payer;
	var payee = req.query.payee;
	var amount_dollars = req.query.amount;

	console.log("\nReceived transaction: " + transaction);
	console.log("user: " + username);

	if (!fileExists(chaincodeIDPath)){
		console.log("Chaincode does not exist");
		res.status(500).json({ error: "Chaincode does not exist" });
	}

	chaincodeID = fs.readFileSync(chaincodeIDPath, 'utf8');
	console.log("chaincodeID: "+chaincodeID);
        
	chain.getUser(username, function(err, userObj) {
		if (err) {
			console.log("User " + username + "not	registered and enrolled: " + err);
			res.status(500).json({ error: err });
		}

    aff = alice.getAffiliation();
    if (aff != null) {
        console.log("result from getAffiliation ", aff)
        pass(t, "getAffiliation");
    } else {
    fail(t, "getAffiliaton", aff);
    }

		app_user = userObj;
		var contractID = uuid.v1();

		// Construct the invoke request
		var invokeRequest = {
			chaincodeID: chaincodeID, // Name (hash) required for invoke
			fcn: "transfer_funds", // Function to trigger
			args: [contractID, payer, payee, amount_dollars] // Parameters for the invoke function
		};

		var retstatus = 200;
		invoke(invokeRequest, username, function(retstatus, err) {
			if(err) {
				console.log("Failed to Invoke Request");
				res.status(500).json({error: err});
				return;
			}
			//res.status(200).json({ status: "Created contract ID: " + contraceID});
			console.log(retstatus);
			res.send(retstatus);
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

function enrollUser(user_name, user_affiliation, init_balance, bank, retstr){
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
				enrollAndRegisterUser(user_name, user_affiliation, init_balance, bank, function(ret ) {
					console.log("enrollUser resp: "+ret);
					retstr(ret);
				});
			}
		});
	return;
}

//
// Register and enroll a new user with the certificate authority.
// This will be performed by the member with registrar authority, WebAppAdmin.
//
function enrollAndRegisterUser(user_name, user_affiliation, init_balance, bank, retstr) {

    //creating a new user
    var registrationRequest = {
        enrollmentID: user_name,
        affiliation: user_affiliation 
    };

		console.log("Now enrolling: " + user_name);
    chain.registerAndEnroll(registrationRequest, function(err, user) {
      if (err) {
				ret = "Failed to register and enroll " + user_name + ": " + err;
				console.log("\n" + ret);
				retstr(ret);
				return;
			}

			console.log("Successfully registered/enrolled user: ", user_name + " affiliation: " + user_affiliation + " initial balance: $" + init_balance + " bank: " + bank);

			registeredUsers.push(user_name);

			chain.getUser(user_name, function(err, user) {				
				
				if (fileExists(chaincodeIDPath)) {
					//retstr("Chaincode already initialized, calling INIT for user: ", user_name);
					console.log(util.format("\nCalling INIT for ", user_name));
					chaincodeID = fs.readFileSync(chaincodeIDPath, 'utf8');

					userObj = user;
					invoke_init_userstate(user_name, user, init_balance, bank, function(invokeresp) {
						console.log("enrollAndRegisterUser(): invoke: "+invokeresp);
						retstr(invokeresp);
					});
				} else {
					userObj = user;
						
					//setting timers for fabric waits
					chain.setDeployWaitTime(config.deployWaitTime);
					console.log("Deploying new chaincode on the Blockchain...");
					deployChaincode(user_name, user, init_balance, bank, function(deployresp) {
						console.log("enrollAndRegisterUser(): deployed: "+deployresp);
						retstr(deployresp);
					});
				}
			});
		});
	return;
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


function deployChaincode(user_name, userObj, init_balance, bank, retstr) {
    //var args = getArgs(config.deployRequest);
    // Construct the deploy request
    var deployRequest = {
        fcn: config.deployRequest.functionName,							// Function to trigger
        args: [user_name, init_balance, bank],							// Arguments to the initializing function
        chaincodePath: config.deployRequest.chaincodePath,	
        certificatePath: network.cert_path									// the location where the startup and 
																														// HSBN store the certificates
    };

    // Trigger the deploy transaction
		console.log("Initialize user:" + user_name + " balance:$" + init_balance + " bank: "+bank);
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
				rtstr = "Failed to initialize the chaincode";
				retstr(rtstr);
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
					console.log(util.format("\nSubmitted chaincode invoke transaction: request=%j, response=%j", invokeRequest, results));
			});
			invokeTx.on('complete', function(results) {
					// Invoke transaction completed successfully
					console.log(util.format("\nSuccessfully completed chaincode invoke transaction: request=%j, response=%j", invokeRequest, results));
			//		retstr(null, "OK");
			});
			invokeTx.on('error', function(err) {
					// Invoke transaction submission failed
					console.log(util.format("\nFailed to submit chaincode invoke transaction: request=%j, error=%j", invokeRequest, err));
					retstr(err);
					eh.unregisterChaincodeEvent(regid);
					return
			});
		});

    //Listen to custom events
    var regid = eh.registerChaincodeEvent(chaincodeID, "evtsender", function(event) {
        console.log(util.format("Custom event received, payload: %j\n", event.payload.toString()));
        eh.unregisterChaincodeEvent(regid);
				
				// Send back the status in the Event
				var myObj = JSON.parse(event.payload.toString());
				console.log("Status: " + myObj.Status);
				console.log("Result: " + myObj.Result);
				retstr(myObj.Status + " " + myObj.Result);

    });

}

function invoke_init_userstate(user_name, userObj, init_balance, bank, retstat) {
    var eh = chain.getEventHub();
    // Construct the invoke request
    var invokeRequest = {
        chaincodeID: chaincodeID,								// Name (hash) required for invoke
        fcn: "init_user",												// Function to trigger
        args: [user_name, init_balance, bank]		// Parameters for the invoke function
    };

		console.log("Initialize balance for " + user_name + " to $" + init_balance + " bank: " + bank);
		invoke(invokeRequest, user_name, function(invokeresp) {
				retstat(invokeresp);
		});
}

function query(user_name, docType, docID, retstr) {
		chain.getUser(user_name, function(err, userObj) {
		if (err) {
			console.log("User " + username + "not	registered and enrolled: " + err);
			retstr( err );
			return;
		}

		console.log("Send query for user: ", user_name);
		// Construct the query request
		var queryRequest = {
			chaincodeID:	chaincodeID, // Name (hash) required for query
			fcn:					"query", // Function to trigger
			args:					[docType, docID] // State variable to retrieve
		};

		console.log("Query document : " + docType);
		console.log("Query document ID: " + docID);

		// Trigger the query transaction
		var queryTx = userObj.query(queryRequest);

		// Query completed successfully
		queryTx.on('complete', function (results) {
			console.log(util.format("Successfully queried existing chaincode state: " +
			"request=%j, response=%j, value=%s", queryRequest, results, results.result.toString()));
			
			retstr(results.result.toString());
			return;
		});
		
		// Query failed
		queryTx.on('error', function (err) {
			var errorMsg = util.format("ERROR: Failed to query existing chaincode " +
			"state: request=%j, error=%j", queryRequest, err);
	
			console.log(errorMsg);
			var resp = util.format("Failed to find document %s with ID: %s", docType, docID);
			retstr(resp);
		});
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
