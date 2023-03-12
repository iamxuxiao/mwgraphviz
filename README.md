# mwgraphviz(Lambda)
This is a AWS Lambda function that draw graphics, return the results as SVG and store the images on AWS S3

## Overall design of the stacks
In this note, my goal is to have a web service perform dot graph rendering on the cloud. The overall design is not entirely server-less because I still have a front end and a thin server dealing with UI and post, but the the real service which is run graphviz within Lambda is indeed ¡°server-less¡±. Here is the work-flow: User types in the textbox some dot text and hit a button to do post, to API-gateway, which is merely a pass-through, then dot text is passed to AWS lambda, the lambda package also contains the executable of graphviz, at there, lambda makes a system call, get the results, in terms of SVG text and return back as a response, for browser to display.

![screenCapOfFrontEnd](https://github.com/iamxuxiao/mwgraphviz/blob/master/workflow.png)


## Compile a statically linked Graphviz
Graphviz program itself has a lot dependencies to other lower level libraries(because the wide range of image format it supports). Additionally when we install graphviz in a fresh OS (like AWS EC2), we do observe that the package manager will also pull in lots of other libraries to be installed, these libraries will be loaded dynamically during the runtime.

However, if we want to deploy graphviz in an AWS Lambda environment, in which case user will have to pack up all the dependencies in a zip file himself, collecting all the libraries that graphviz depends on is a very daunting task. Fortunately, the graphviz maintainer offers a build command to compile dot statically, it does not necessary pulls the entire libraries needed, but the build process does produced a static executable, which is self sustained and can be ran independently, and contains the major functionalties, some of the functionality might be lacking(my assumption): One can at least take a dot format text file, and produce a vectorized file( SVG, EPS etc).

Because binary executable is platform dependent, in order to deploy it on Lambda, we will have to compile the graphviz on a ubuntu machine at least. To be safe, I would just rent a EC2 (which enivorment will be at least the closest to lambda), and build process, and uploading the lambda should be done within 1 hour. Below is the excerpt of EC2 terminal log, demonstrating how to build dot into a statically linked executable
```
$ wget http://www.graphviz.org/pub/graphviz/stable/SOURCES/graphviz-2.40.1.tar.gz
$ tar -xvf graphviz-2.40.1.tar.gz 
$ // cd into the directory
$ ./configure
$ // install missing dependencies if there is any 
$ make 
$ cd cmd/dot
$ make dot_static
```
## API-Gateway
An api-gateway is necessary for external service to call the lambda( Lambda can be called directly using AWS-SDK but via api-gateway is a choice in this notes). In this case: One would simply

1.create a resource
2.create a post method
3.point the request to the lambda (we are about to create in the next section)
4.deploy the api

## AWS Lambda that calls to graphviz
The zip file we will upload to AWS lambda contains the dot_static as well as the index.js. The dot command accepts a file as input and write the result to another file. Because essentially lambda runs within a container, the program does have the write permission to a temp directory. which is /tmp. So we first write the incoming dot text to a disk and then call graphviz on it to generate a SVG file on the disk, and then read its contents and pass it back as response.

```javascript
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
```

Some caveats, due to cold start time of lambda and in this example , the disk time and actually called an externa program within a lambda. Sometime the code takes more than default time(3000ms) to finish, so on the safe side, I set the time limit to be 5000ms.

## Frontend design
The front end is as simple as the following: a text area for user to type in the dot text, the button¡¯s callback will make a post to the api-gateway. If you do not want your api-gateway¡¯s address to be seen by the user, the button will post the text to a thin server which on the server side, contains the code to call api-gateway. After the response is received, fill the svg onto the canvas

```
+-text area-----------------+
|                           |                                        
+---------------------------+

+---------+               
| button  |                 
+---------+                 

+--canvas  -----------------+
|                           |
|                           |
+---------------------------+
```

![screenCapOfFrontEnd](https://github.com/iamxuxiao/mwgraphviz/blob/master/mwgraphviz1.png)
