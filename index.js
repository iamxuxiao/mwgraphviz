var fs    = require('fs') ;
var spawn = require('child_process').spawn
var AWS   = require('aws-sdk')
var uuid = require("uuid");      // random svg name generation.


AWS.config.loadFromPath('./s3config.json');


var postprocess = function( svg ){
    svg = svg.replace(/[\n]/g,' ');
    svg = svg.replace(/\\/g,' ')    
    return svg;
}

exports.handler = (event, context, callback) => {

    var name = uuid.v4();
    var dotname = "/tmp/"+name+".dot";
    var svgname = "/tmp/"+name+".svg";
    var s3name = name+".svg";

    // dot text will be coming as event.data
    // write it to tmp directory
    fs.writeFileSync(dotname,event.data);
    
    // run dot on tmp dot file and generate tmp svg file
    var gendot = spawn('./dot_static',['-Tsvg', dotname,'-o',svgname])
    gendot.stdout.on('data',function(data){
        //console.log('stdout:'+data);
    });
    
    gendot.stderr.on('data',function(data){
        console.log('stderr:'+data);
        //pass the parsing error back
    });
    
    gendot.on('close',function(code){
        console.log('child process exited with code: '+ code);
        var svgtext = fs.readFileSync(svgname,"utf8").toString(); 
        svgtext = postprocess(svgtext);

        //context.succeed(svgtext);

        //upload the file
        var s3 = new AWS.S3({
	    "region": "us-east-1"
        });
	console.log(svgname);
        s3.putObject({
            Bucket: '', // fill the S3 bucket name
            Key:  s3name,
            Body: svgtext,
            ACL: "public-read"        },
                     function(perr,pres){
			 var data={ "svg":svgtext,
				    "name":s3name};
                         context.succeed(data);
                     })
    })
    
};
