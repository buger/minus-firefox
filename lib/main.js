var self = require('self');		
var tabs = require('tabs');
var pageMod = require('page-mod');
var ui = require('ui');
var request = require('request');
var ss = require("simple-storage");
var storage = ss.storage;
var data = self.data;
var captureData;

var xhr = require('xhr');
var {Cc, Ci, Cu} = require("chrome");
var mediator = Cc['@mozilla.org/appshell/window-mediator;1']
	.getService(Ci.nsIWindowMediator);
var wnd = mediator.getMostRecentWindow("navigator:browser").wrappedJSObject;


function createGallery(callback) {
    request.Request({
        url: "http://minus.com/api/CreateGallery",

        onComplete: function(resp) {
            console.log(JSON.stringify(resp.json));
            callback(resp.json);
        }
    }).post();
}

function hashToQueryString(hash) {
    var params = [];

    for (key in hash) {
        if (hash.hasOwnProperty(key)) {
            params.push(key + "=" + hash[key]);
        }
    }

    return params.join('&');
}
 
function uploadItem(editor_id, filename, mime, base64Data, callback) {
    var binaryData = wnd.atob(base64Data.replace(/^data\:image\/png\;base64\,/,''));

    filename = encodeURIComponent(filename.replace(/^\./,''));        

    var params = hashToQueryString({ editor_id: editor_id, key: "OK", filename:filename });

    var boundary = '---------------------------';
    boundary += Math.floor(Math.random()*32768);
    boundary += Math.floor(Math.random()*32768);
    boundary += Math.floor(Math.random()*32768);

    var data = '--' + boundary + "\r\n";
    data += 'Content-Disposition: form-data; name="file"; filename="' + filename + '"' + "\r\n";
    data += 'Content-Type: ' + mime + "\r\n\r\n";
    data += binaryData;
    data += "\r\n";
    data += "\r\n" + '--' + boundary + '--'
    data += "\r\n";
    
    var url = "http://minus.com/api/UploadItem?"+params;

    console.log("URL", url);

    var request;

    request = new xhr.XMLHttpRequest();
    request.open("POST", url, true);

    request.onreadystatechange = function () {
        if (request.readyState == 4) {
            console.log("Status:", request.status);

            callback(editor_id);
        }
    }
    request.setRequestHeader('Content-Type', 'multipart/form-data; boundary=' + boundary);
    
    request.sendAsBinary(data);    
}

// edit
pageMod.PageMod({
	include: 'resource://*',
	contentScriptWhen: 'ready',
	contentScriptFile: [data.url("message_bridge.js")],
	onAttach: function(worker) {
		worker.on('message', function(msg) {
            console.log('Received message', msg.method);

            var reply = {}

			switch(msg.method) {
			    case 'updateGalleries':                    
                    reply['url'] = "http://minus.com/api/pane/" + msg.timeline + ".json/" + msg.page;
	    			break;

                case 'takeScreenshot':
                    ui.capture(msg.captureType);
                    break;

                case 'getCaptureData':
                    captureData = ui.getCaptureData();
                    worker.postMessage({ 'message': { reply:true,  __id: msg.__id, response: captureData }});
                    break;

                case 'uploadScreenshot':
                    delete reply;
                    
                    ui.startToolbarAnimation();

                    var callback = function(gallery_id) {
                        tabs.open('http://minus.com/m'+ gallery_id);                        
                        worker.tab.close();
                        ui.stopToolbarAnimation();
                    }

                    if (msg.gallery == 'new') {                        
                        createGallery(function(gallery) {
                            uploadItem(gallery.reader_id, msg.title + ".png", "image/png", msg.imageData, callback);
                        });
                    } else {
                        uploadItem(msg.gallery, msg.title + ".png", "image/png", msg.imageData, callback);
                    }
                    break;

                case 'getSettings':
                    reply['settings'] = storage.options;

                    break;
			}

            if (reply)
                if (reply.url) {
                    request.Request({
                        url: reply.url, 
                        onComplete: function(response) {
                            console.log("response!", response.json, reply.url);

                            worker.postMessage({ 'message': { reply:true,  __id: msg.__id, response: response.json }});
                        }
                    }).get();                   
                } else {
                    worker.postMessage({ message: { reply:true, __id: msg.__id, response: reply }});
                }
		}); 
	}
});	

// options
function initOptions() {
	storage.options = {
		format:'png',
		shortcuts:{
			"visible":{"enable":false,"key":"V"},
			"entire":{"enable":false,"key":"H"}
		}
	};
}

function initCustomize() {
	storage.customize = {
		parent:'nav-bar',
		next:null
	};
}

if (!storage.options) initOptions();
if (!storage.customize) initCustomize();
ui.init();
