var express = require("express");
var app = express();


app.configure(function () {
	app.use(
		"/", // the URL throught which you want to access to you static content
        express.static(__dirname) //where your static content is located in your filesystem
    );
});

 /* serves main page */
 app.get("/user/add", function(req, res) {
    //res.sendfile('index.htm')
		res.send("Hello there");
 });

  app.post("/user/add", function(req, res) { 
	/* some server side logic */
	res.send("OK");
  });

 /* serves all the static files */
 app.get(/^(.+)$/, function(req, res){ 
     console.log('static file request : ' + req.params);
     res.sendfile( __dirname + req.params[0]); 
 });

 var port = process.env.PORT || 5000;
 app.listen(port, function() {
   console.log("Listening on " + port);
 });
