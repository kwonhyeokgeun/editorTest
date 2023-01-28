const express = require('express');
const app = express();
const https = require('https');
const wrtc = require('wrtc');
const fs = require('fs');

var mkdirp = require('mkdirp');
const path = require('path');
const fsextended = require('fs-extended');


const options = {
    key: fs.readFileSync('./keys/privkey.pem'),
    cert: fs.readFileSync('./keys/cert.crt')
};

const server = https.createServer(options, app).listen(443, () => {
    console.log("Create HTTPS Server");
});

const io = require('socket.io')(server,{
    cors: {
        origin: "*",
      }
});



let meetingRooms = {}; //meetingRooms[roomId][0]=socketId 
let userNames={}; //userNames[socketId]="김민수"
let meetingLeaders={}; //meetingLeaders[roomId]=방장 이름이나 id  //아직 안썼음


let shareUsers={}; //shareUsers[roomId]=socketId

let sendPCs = { //sendPCs[purpose][senderSocketId][receiverSocketId]= pc
    "user":{},
    "share":{}
}; 
let receivePCs = { //receivePCs[purpose][socketId]=pc
    "user":{},
    "share":{}
}; 

let streams = { //streams[purpose][roomId][socketId]=stream  //받는 stream만
    "user":{},
    "share":{}
}; 

const pc_config = {
    iceServers: [
        // {
        //   urls: 'stun:[STUN_IP]:[PORT]',
        //   'credentials': '[YOR CREDENTIALS]',
        //   'username': '[USERNAME]'
        // },
        {
            urls: "stun:edu.uxis.co.kr"
        },
        {
            urls: "turn:edu.uxis.co.kr?transport=tcp",
                    "username": "webrtc",
                    "credential": "webrtc100!"
        }
    ],
}
app.engine('html', require('ejs').renderFile);
app.set('view engine', 'html');
app.get('/', (request, response) => {
    response.render('./test.html');
});




let cursors = {};
let files={};

function setStorage(){
    const storage = fs.existsSync("./storage")
    if(!storage){
        fs.mkdirSync("./storage")
    }else{
        try {
            fs.rmdirSync("./storage", { recursive: true });
        
            fs.mkdirSync("./storage")
        } catch (err) {
            console.error(`storage삭제 에러.`);
        }
    }
}

var applyOperation = function(file, operation)
{
	if(operation.version < file.version) {
		console.error("Dropped operation, bad version (TODO)", operation);
		return false;
	}
	if(typeof operation.insert !== 'undefined') {
		file.content = [file.content.slice(0, operation.position), operation.insert, file.content.slice(operation.position)].join('');
		file.version++;
	} else if(typeof operation.remove !== 'undefined') {
		file.content = [file.content.slice(0, operation.position), file.content.slice(operation.position+operation.remove)].join('');
		file.version++;
	}
	return true;
}

setStorage();
setInterval(function() {  //1초마다 동기화 해주기
	for(var filename in files) {
		if(!files.hasOwnProperty(filename)) continue;
		var dir = path.dirname('./storage/'+filename);
		mkdirp.sync(dir);
		fs.writeFileSync('./storage/'+filename, files[filename].content);
	}
}, 1000);

io.on('connection', function(socket) {
    console.log("connection");

    let roomId;
    let edited_file;
    let userName;
    
    socket.on('open', (data) => {
        roomId = data.roomId;
        userName = data.userName;  //추후 지우기

        edited_file = data.filename;
        

		socket.join(roomId); //추후 지우기

		if(typeof files[edited_file] === 'undefined') {
            cursors[roomId]={}
            files[edited_file] = {
                version: 0,
                content: "hello world!!"
            };
		}
		for(var otheruser in cursors[roomId]) {
			if(!cursors[roomId].hasOwnProperty(otheruser)) continue;
			if(cursors[roomId][otheruser].file != edited_file) continue;
			socket.emit('cursor', {user: otheruser, cursor: cursors[roomId][otheruser].cursor});
		}
		socket.emit('open',{
            version: files[edited_file].version,
            content: files[edited_file].content
        })
	});

    socket.on('post', function(operation, callback) {
		if(applyOperation(files[edited_file], operation)) {
			callback({success: true, version: files[edited_file].version});
			socket.broadcast.to(roomId).emit('operation', operation);
		} else {
			callback({success: false});
		}
	});

	socket.on('cursor', function(cursor) {
		cursors[roomId][userName] = {cursor: cursor, file: edited_file};
		socket.broadcast.to(roomId).emit('cursor', {user: userName, cursor: cursor});
	});

	socket.on('disconnect', function() {
		socket.broadcast.to(roomId).emit('cursorremove', userName);
		try{
            delete cursors[roomId][userName];
        }catch(e){
            console.log(e)
        }
        try{
            if(Object.keys(cursors[roomId]).length==0){
                fs.unlinkSync('./storage/'+edited_file);
		        delete files[edited_file];
                //console.log(Object.keys(files))
            }
        }catch(e){
            console.log(e)
        }
		
	});
})