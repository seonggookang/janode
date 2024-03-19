'use strict';

import { readFileSync, readdirSync, readdir, statSync } from 'fs';
import Janode from '../../../src/janode.js';
import config from './config.js';
import url from 'url';

const { janode: janodeConfig, web: serverConfig } = config;

import { fileURLToPath } from 'url';
import { dirname, basename } from 'path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const { Logger } = Janode;
const LOG_NS = `[${basename(__filename)}]`;
import VideoRoomPlugin from '../../../src/plugins/videoroom-plugin.js';

import express from 'express';
import ejs from "ejs";

const app = express();
const options = {
  key: serverConfig.key ? readFileSync(serverConfig.key) : null,
  cert: serverConfig.cert ? readFileSync(serverConfig.cert) : null,
};
import { createServer as createHttpsServer } from 'https';
import { createServer as createHttpServer } from 'http';
const httpServer = (options.key && options.cert) ? createHttpsServer(options, app) : createHttpServer(app);
import { Server } from 'socket.io';
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    // allowedHeaders: ["Access-Control-Allow-Origin"],
  }
});

const scheduleBackEndConnection = (function () {
  let task = null;

  return (function (del = 10) {
    if (task) return;
    Logger.info(`${LOG_NS} scheduled connection in ${del} seconds`);
    task = setTimeout(() => {
      initBackEnd()
        .then(() => task = null)
        .catch(() => {
          task = null;
          scheduleBackEndConnection();
        });
    }, del * 1000);
  });
})();

let janodeSession;
let janodeManagerHandle;
let current_leaving_display = '';

// 큐에 넣을 요청들을 저장할 배열
const clientQueue = [];

(function main() {

  initFrontEnd().catch(({ message }) => Logger.error(`${LOG_NS} failure initializing front-end: ${message}`));

  scheduleBackEndConnection(1);

})();

async function initBackEnd() {
  Logger.info(`${LOG_NS} connecting Janode...`);
  let connection;

  try {
    connection = await Janode.connect(janodeConfig);
    Logger.info(`${LOG_NS} connection with Janus created`);

    connection.once(Janode.EVENT.CONNECTION_CLOSED, () => {
      Logger.info(`${LOG_NS} connection with Janus closed`);
    });

    connection.once(Janode.EVENT.CONNECTION_ERROR, error => {
      Logger.error(`${LOG_NS} connection with Janus error: ${error.message}`);

      replyError(io, 'backend-failure');

      scheduleBackEndConnection();
    });

    const session = await connection.create();
    Logger.info(`${LOG_NS} session ${session.id} with Janus created`);
    janodeSession = session;

    session.once(Janode.EVENT.SESSION_DESTROYED, () => {
      Logger.info(`${LOG_NS} session ${session.id} destroyed`);
      janodeSession = null;
    });

    const handle = await session.attach(VideoRoomPlugin);
    Logger.info(`${LOG_NS} manager handle ${handle.id} attached`);
    janodeManagerHandle = handle;

    // generic handle events
    handle.once(Janode.EVENT.HANDLE_DETACHED, () => {
      Logger.info(`${LOG_NS} ${handle.name} manager handle detached event`);
    });
  }
  catch (error) {
    Logger.error(`${LOG_NS} Janode setup error: ${error.message}`);
    if (connection) connection.close().catch(() => { });

    // notify clients
    replyError(io, 'backend-failure');

    throw error;
  }
}

function initFrontEnd() {
  if (httpServer.listening) return Promise.reject(new Error('Server already listening'));

  Logger.info(`${LOG_NS} initializing socketio front end...`);

  io.on('connection', function (socket) {
    const remote = `[${socket.request.connection.remoteAddress}:${socket.request.connection.remotePort}]`;
    Logger.info(`${LOG_NS} ${remote} connection with client established`);

    const clientHandles = (function () {
      let handles = [];
      console.log('the available handles are:')
      console.log(handles)

      return {
        insertHandle: handle => {
          handles.push(handle);
        },
        getHandleByFeed: feed => {
          return handles.find(h => h.feed === feed);
        },

        getHandleByStream: feed => {
          console.log('===========Printing out the streams=========', handles)
          return handles.find(h => h.streams === feed);
        },

        removeHandle: handle => {
          handles = handles.filter(h => h.id !== handle.id);
        },
        removeHandleByFeed: feed => {
          handles = handles.filter(h => h.feed !== feed);
        },
        leaveAll: () => {
          console.log(handles)
          const leaves = handles.map(h => h.leave().catch(() => { }));
          return Promise.all(leaves);
        },
        detachAll: () => {
          const detaches = handles.map(h => h.detach().catch(() => { }));
          handles = [];
          return Promise.all(detaches);
        },
        getAllHandles: () => {
          return handles
        },
      };
    })();

    /*----------*/
    /* USER API */
    /*----------*/
    
    function getDateTime() {
      var today = new Date();
      var date = today.getFullYear() + '-' + (today.getMonth()+1) + '-' + today.getDate();
      var time = today.getHours() + ":" + today.getMinutes() + ":" + today.getSeconds()+ ":" + today.getMilliseconds();
      var date_time = date + ' ' + time;  
      return date_time;
    }

    const hasDuplicate = (compare, arrayObj, colName) => {
      var hash = Object.create(null);
      return arrayObj.some((arr) => {
        console.log(compare, arr[colName], arr['num_participants']);
        if (compare == arr[colName]) {
          return parseInt(arr['num_participants']) + 1;
        }
      });
    };

    const numParticipants = (compare, arrayObj) => {

      for(var i = 0; i < arrayObj.length; i++) {
        // console.log(typeof compare, compare, typeof arrayObj[i]['room'], arrayObj[i]['room'], arrayObj[i]['num_participants']);
        if (compare == arrayObj[i]['room']) {
          console.log('SAME....................', arrayObj[i]['room'], arrayObj[i]['num_participants']);
          return arrayObj[i]['num_participants'];
        }

      }
    };

    socket.on('join', async (evtdata = {}) => {
      Logger.info(`${LOG_NS} ${remote} join received`);
      const { _id, data: joindata = {} } = evtdata;
      console.log('The new user joined the room')
      console.log(evtdata)
      console.log(evtdata.data)

      console.log("=========Join handle information===========", clientHandles.getAllHandles())

      if (!checkSessions(janodeSession, true, socket, evtdata)) return;

      let pubHandle;

      try {
        pubHandle = await janodeSession.attach(VideoRoomPlugin);
        Logger.info(`${LOG_NS} ${remote} videoroom publisher handle ${pubHandle.id} attached`);
        clientHandles.insertHandle(pubHandle);

        // custom videoroom publisher/manager events

        pubHandle.on(VideoRoomPlugin.EVENT.VIDEOROOM_DESTROYED, evtdata => {
          replyEvent(socket, 'destroyed', evtdata);
        });

        pubHandle.on(VideoRoomPlugin.EVENT.VIDEOROOM_PUB_LIST, evtdata => {
          replyEvent(socket, 'feed-list', evtdata);
        });

        pubHandle.on(VideoRoomPlugin.EVENT.VIDEOROOM_PUB_PEER_JOINED, evtdata => {
          replyEvent(socket, 'feed-joined', evtdata);
        });

        pubHandle.on(VideoRoomPlugin.EVENT.VIDEOROOM_UNPUBLISHED, evtdata => {
          const handle = clientHandles.getHandleByFeed(evtdata.feed);
          clientHandles.removeHandleByFeed(evtdata.feed);
          if (handle) handle.detach().catch(() => { });
          replyEvent(socket, 'unpublished', evtdata);
        });

        pubHandle.on(VideoRoomPlugin.EVENT.VIDEOROOM_LEAVING, evtdata => {
          const handle = clientHandles.getHandleByFeed(evtdata.feed);
          clientHandles.removeHandleByFeed(evtdata.feed);
          if (handle) handle.detach().catch(() => { });
          replyEvent(socket, 'leaving', evtdata);
        });

        pubHandle.on(VideoRoomPlugin.EVENT.VIDEOROOM_DISPLAY, evtdata => {
          replyEvent(socket, 'display', evtdata);
        });

        pubHandle.on(VideoRoomPlugin.EVENT.VIDEOROOM_TALKING, evtdata => {
          replyEvent(socket, 'talking', evtdata);
        });

        pubHandle.on(VideoRoomPlugin.EVENT.VIDEOROOM_KICKED, evtdata => {
          const handle = clientHandles.getHandleByFeed(evtdata.feed);
          clientHandles.removeHandleByFeed(evtdata.feed);
          if (handle) handle.detach().catch(() => { });
          replyEvent(socket, 'kicked', evtdata);
        });

        // generic videoroom events
        pubHandle.on(Janode.EVENT.HANDLE_WEBRTCUP, () => Logger.info(`${LOG_NS} ${pubHandle.name} webrtcup event`));
        pubHandle.on(Janode.EVENT.HANDLE_MEDIA, evtdata => Logger.info(`${LOG_NS} ${pubHandle.name} media event ${JSON.stringify(evtdata)}`));
        pubHandle.on(Janode.EVENT.HANDLE_SLOWLINK, evtdata => Logger.info(`${LOG_NS} ${pubHandle.name} slowlink event ${JSON.stringify(evtdata)}`));
        pubHandle.on(Janode.EVENT.HANDLE_HANGUP, evtdata => Logger.info(`${LOG_NS} ${pubHandle.name} hangup event ${JSON.stringify(evtdata)}`));
        pubHandle.on(Janode.EVENT.HANDLE_DETACHED, () => {
          Logger.info(`${LOG_NS} ${pubHandle.name} detached event`);
          clientHandles.removeHandle(pubHandle);
        });
        pubHandle.on(Janode.EVENT.HANDLE_TRICKLE, evtdata => Logger.info(`${LOG_NS} ${pubHandle.name} trickle event ${JSON.stringify(evtdata)}`));

        const response = await pubHandle.joinPublisher(joindata);

        replyEvent(socket, 'joined', response, _id);

        Logger.info(`${LOG_NS} ${remote} joined sent`);
      } catch ({ message }) {
        if (pubHandle) pubHandle.detach().catch(() => { });
        replyError(socket, message, joindata, _id);
      }
    });

    socket.on('subscribe', async (evtdata = {}) => {
      console.log("===== subscribe ====", 'To whom=', evtdata);
      Logger.info(`${LOG_NS} ${remote} subscribe received as below`);
      
      // Extract necessary data from the event payload
      const { _id, data: joindata = {} } = evtdata;

      // Check and validate sessions
      if (!checkSessions(janodeSession, true, socket, evtdata)) return;

      let subHandle;

      try {

        // Attach a Janode session with VideoRoomPlugin to handle the subscription
        subHandle = await janodeSession.attach(VideoRoomPlugin);
        Logger.info(`${LOG_NS} ${remote} videoroom listener handle ${subHandle.id} attached`);
        clientHandles.insertHandle(subHandle);

        // generic videoroom events
        // Setup event listeners for various Janode events
        subHandle.on(Janode.EVENT.HANDLE_WEBRTCUP, () => Logger.info(`${LOG_NS} ${subHandle.name} webrtcup event`));
        subHandle.on(Janode.EVENT.HANDLE_SLOWLINK, evtdata => Logger.info(`${LOG_NS} ${subHandle.name} slowlink event ${JSON.stringify(evtdata)}`));
        subHandle.on(Janode.EVENT.HANDLE_HANGUP, evtdata => Logger.info(`${LOG_NS} ${subHandle.name} hangup event ${JSON.stringify(evtdata)}`));
        subHandle.once(Janode.EVENT.HANDLE_DETACHED, () => {
          Logger.info(`${LOG_NS} ${subHandle.name} detached event`);
          clientHandles.removeHandle(subHandle);
        });
        subHandle.on(Janode.EVENT.HANDLE_TRICKLE, evtdata => Logger.info(`${LOG_NS} ${subHandle.name} trickle event ${JSON.stringify(evtdata)}`));

        // Set up specific event listeners for VideoRoomPlugin events
        subHandle.on(VideoRoomPlugin.EVENT.VIDEOROOM_SC_SUBSTREAM_LAYER, evtdata => Logger.info(`${LOG_NS} ${subHandle.name} simulcast substream layer switched to ${evtdata.sc_substream_layer}`));
        subHandle.on(VideoRoomPlugin.EVENT.VIDEOROOM_SC_TEMPORAL_LAYERS, evtdata => Logger.info(`${LOG_NS} ${subHandle.name} simulcast temporal layers switched to ${evtdata.sc_temporal_layers}`));

        // Join the listener to the videoroom and get the response
        const response = await subHandle.joinListener(joindata);

        // Reply with the 'subscribed' event and the received response
        replyEvent(socket, 'subscribed', response, _id);
        Logger.info(`${LOG_NS} ${remote} subscribed sent`);
      } catch ({ message }) {

        // Handle errors during the subscription
        console.log('subscribe error...', message);
        if (subHandle) subHandle.detach().catch(() => { });
        replyError(socket, message, joindata, _id);
      }
    });

    socket.on('publish', async (evtdata = {}) => {
      Logger.info(`${LOG_NS} ${remote} publish received`);
      const { _id, data: pubdata = {} } = evtdata;

      const handle = clientHandles.getHandleByFeed(pubdata.feed);
      if (!checkSessions(janodeSession, handle, socket, evtdata)) return;

      try {
        const response = await handle.publish(pubdata);
        replyEvent(socket, 'published', response, _id);
        Logger.info(`${LOG_NS} ${remote} published sent`);
      } catch ({ message }) {
        replyError(socket, message, pubdata, _id);
      }
    });

    socket.on('configure', async (evtdata = {}) => {
      Logger.info(`${LOG_NS} ${remote} configure received as below`);
      // console.log(evtdata);
      const { _id, just_configure, data: confdata = {} } = evtdata;

      try {
        console.log("===== configure handle ====", confdata.feed, just_configure);

        // Retrieve the Janode Handle associated with the specified feed
        const handle = clientHandles.getHandleByFeed(confdata.feed);

        // Check and Validate sessions
        if (!checkSessions(janodeSession, handle, socket, evtdata)) return;
        
        // Configure the handle with the provided configuration data
          const response = await handle.configure(confdata);

          console.log("======configure handle response from server======", response)

        // Remove the 'configured' key from the response and add 'just_configure' flag
          delete response.configured;
          response.just_configure = just_configure;

          // Reply with the 'configured' event and the modified response
          replyEvent(socket, 'configured', response, _id);
          Logger.info(`${LOG_NS} ${remote} configured sent as above`);
      } catch ({ message }) {
        // Handle errors during the configuration
        console.log('configure error....');
        replyError(socket, message, confdata, _id);
      }
    });

    socket.on('update', async (evtdata = {}) => {
      Logger.info(`${LOG_NS} ${remote} updated received as below`);
      const { _id, data: confdata = {} } = evtdata;
      console.log('evtdata in update >>> ', evtdata.data);
      try {

        let handle;
        if (confdata.subscribe){
          handle = clientHandles.getHandleByFeed(confdata.subscribe[0].feed);
        } else if (confdata.unsubscribe){
          handle = clientHandles.getHandleByFeed(confdata.unsubscribe[0].feed);
        } else{
          console.log('=========Invalid update data(no data)=========')
          return;
        }
        
        // Check and Validate sessions
        if (!checkSessions(janodeSession, handle, socket, evtdata)) return;
        
        // Configure the handle with the provided configuration data
        const response = await handle.update(confdata);

        console.log("======Inside update, update handle response from server======", response)

        // Exit if the stream is undefined. This is because stream does not exist
        if (!response || typeof response.streams === 'undefined'){
          console.log("======the streams from the response is undefined, stream does not exist======")
          return; 
        } 
          replyEvent(socket, 'updated', response, _id);
          Logger.info(`${LOG_NS} ${remote} configured sent as above`);
      } catch ({ message }) {
        // Handle errors during the configuration
        console.log('configure error....');
        replyError(socket, message, confdata, _id);
      }
    });

    socket.on('unpublish', async (evtdata = {}) => {
      Logger.info(`${LOG_NS} ${remote} unpublish received as below`);
      console.log(evtdata);
      const { _id, data: unpubdata = {} } = evtdata;

      const handle = clientHandles.getHandleByFeed(unpubdata.feed);
      if (!checkSessions(janodeSession, handle, socket, evtdata)) return;

      try {
        const response = await handle.unpublish();
        replyEvent(socket, 'unpublished', response, _id);
        Logger.info(`${LOG_NS} ${remote} unpublished sent`);
      } catch ({ message }) {
        replyError(socket, message, unpubdata, _id);
      }
    });


    socket.on('leave', async (evtdata = {}) => {
      Logger.info(`${LOG_NS} ${remote} leave received`);
      const { _id, data: leavedata = {} } = evtdata;
      console.log('A leave requested has been received by the server. The received are:')
      
      const handle = clientHandles.getHandleByFeed(leavedata.feed);

      try {
        const response = await handle.leave();
        replyEvent(socket, 'leaving', response, _id);
        Logger.info(`${LOG_NS} ${remote} leaving sent`);
        handle.detach().catch(() => { });
      } catch ({ message }) {
        replyError(socket, message, leavedata, _id);
      }
    });
  
    socket.on('leaveAll', async (evtdata = {}) => {
      // 여기는 룸을 나가는 본인에게만 발생한다.
      // 나머지 클라이언트는 leaving 이벤트가 발생한다.
      Logger.info(`${LOG_NS} ${remote} leaveAll received ${evtdata}`);
      console.log('=============LEAVEALL=============');
      console.log(evtdata.data);
      console.log(evtdata);
      // console.log(_id);
      // console.log(leavedata);
      current_leaving_display = evtdata.data.display;
      await clientHandles.leaveAll();
      await clientHandles.detachAll();
      replyEvent(socket, 'leaveAll', evtdata);

    });    

    socket.on('start', async (evtdata = {}) => {
      Logger.info(`${LOG_NS} ${remote} start received as below`);
    
      const { _id, data: startdata = {} } = evtdata;
      const handle = clientHandles.getHandleByFeed(startdata.feed);
      
      console.log("===== start handle ====", 'To whom=', startdata.feed);
      if (!checkSessions(janodeSession, handle, socket, evtdata)) return;

      try {
       
        const response = await handle.start(startdata);
        replyEvent(socket, 'started', response, _id);
        Logger.info(`${LOG_NS} ${remote} started sent as above`);
      } catch ({ message }) {
        replyError(socket, message, startdata, _id);
      }
    });

    socket.on('pause', async (evtdata = {}) => {
      Logger.info(`${LOG_NS} ${remote} pause received`);
      console.log(evtdata);
      const { _id, data: pausedata = {} } = evtdata;

      const handle = clientHandles.getHandleByFeed(pausedata.feed);
      if (!checkSessions(janodeSession, handle, socket, evtdata)) return;

      try {
        const response = await handle.pause();
        replyEvent(socket, 'paused', response, _id);
        Logger.info(`${LOG_NS} ${remote} paused sent`);
      } catch ({ message }) {
        replyError(socket, message, pausedata, _id);
      }
    });

    socket.on('switch', async (evtdata = {}) => {
      Logger.info(`${LOG_NS} ${remote} switch received`);
      console.log(evtdata);
      const { _id, data: switchdata = {} } = evtdata;

      const handle = clientHandles.getHandleByFeed(switchdata.from_feed);
      if (!checkSessions(janodeSession, handle, socket, evtdata)) return;

      try {
        const response = await handle.switch({
          to_feed: switchdata.to_feed,
          audio: switchdata.audio,
          video: switchdata.video,
          data: switchdata.data,
        });
        replyEvent(socket, 'switched', response, _id);
        Logger.info(`${LOG_NS} ${remote} switched sent`);
      } catch ({ message }) {
        replyError(socket, message, switchdata, _id);
      }
    });

    // trickle candidate from the client
    socket.on('trickle', async (evtdata = {}) => {
      Logger.info(`${LOG_NS} ${remote} trickle received`);
      const { _id, data: trickledata = {} } = evtdata;

      const handle = clientHandles.getHandleByFeed(trickledata.feed);
      if (!checkSessions(janodeSession, handle, socket, evtdata)) return;

      handle.trickle(trickledata.candidate).catch(({ message }) => replyError(socket, message, trickledata, _id));
    });

    // trickle complete signal from the client
    socket.on('trickle-complete', async (evtdata = {}) => {
      Logger.info(`${LOG_NS} ${remote} trickle-complete received`);
      const { _id, data: trickledata = {} } = evtdata;

      const handle = clientHandles.getHandleByFeed(trickledata.feed);
      if (!checkSessions(janodeSession, handle, socket, evtdata)) return;

      handle.trickleComplete(trickledata.candidate).catch(({ message }) => replyError(socket, message, trickledata, _id));
    });

    // socket disconnection event
    socket.on('disconnect', async () => {
      Logger.info(`${LOG_NS} ${remote} disconnected socket`);

      await clientHandles.leaveAll();
      await clientHandles.detachAll();
    });

    /*----------------*/
    /* Management API */
    /*----------------*/


    socket.on('list-participants', async (evtdata = {}) => {
      Logger.info(`${LOG_NS} ${remote} list_participants received`);
      console.log(evtdata);
      const { _id, data: listdata = {} } = evtdata;

      if (!checkSessions(janodeSession, janodeManagerHandle, socket, evtdata)) return;

      try {
        const response = await janodeManagerHandle.listParticipants(listdata);
        replyEvent(socket, 'participants-list', response, _id);
        Logger.info(`${LOG_NS} ${remote} participants-list sent`);
      } catch ({ message }) {
        replyError(socket, message, listdata, _id);
      }
    });

    socket.on('kick', async (evtdata = {}) => {
      Logger.info(`${LOG_NS} ${remote} kick received`);
      console.log(evtdata);
      const { _id, data: kickdata = {} } = evtdata;

      if (!checkSessions(janodeSession, janodeManagerHandle, socket, evtdata)) return;

      try {
        const response = await janodeManagerHandle.kick(kickdata);
        replyEvent(socket, 'kicked', response, _id);
        Logger.info(`${LOG_NS} ${remote} kicked sent`);
      } catch ({ message }) {
        replyError(socket, message, kickdata, _id);
      }
    });

    socket.on('exists', async (evtdata = {}) => {
      Logger.info(`${LOG_NS} ${remote} exists received`);
      console.log(evtdata);
      const { _id, data: existsdata = {} } = evtdata;

      if (!checkSessions(janodeSession, janodeManagerHandle, socket, evtdata)) return;

      try {
        const response = await janodeManagerHandle.exists(existsdata);
        replyEvent(socket, 'exists', response, _id);
        Logger.info(`${LOG_NS} ${remote} exists sent`);
      } catch ({ message }) {
        replyError(socket, message, existsdata, _id);
      }
    });

    socket.on('list-rooms', async (evtdata = {}) => {
      console.log('=========== list-rooms ===================AnoptaCode');
      Logger.info(`${LOG_NS} ${remote} list-rooms received as below`);
      console.log(evtdata);
      const { _id, data: listdata = {} } = evtdata;

      console.log("=========listRooms=========", evtdata)

      if (!checkSessions(janodeSession, janodeManagerHandle, socket, evtdata)) return;

      try {
        const response = await janodeManagerHandle.list();
        try {
          // console.log("====================");
          // console.log(response);
          var simple_response = JSON.stringify(response.list);
          // console.log(simple_response);

          console.log("=========listRooms========= response from server", simple_response)
        } catch ({ message }) {
          console.log(message);
        }
          replyEvent(socket, 'rooms-list', simple_response, _id);
        Logger.info(`${LOG_NS} ${remote} rooms-list sent`);
      } catch ({ message }) {
        replyError(socket, message, listdata, _id);
      }
    });

    socket.on('create', async (evtdata = {}) => {
      Logger.info(`${LOG_NS} ${remote} create received`);
      const { _id, data: createdata = {} } = evtdata;
      console.log(createdata);

      if (!checkSessions(janodeSession, janodeManagerHandle, socket, evtdata)) return;

      // 같은 이름의 방이 있는지 확인
      try {
        const response = await janodeManagerHandle.list();
        // console.log("====================");
        // console.log(response);

        if (hasDuplicate(createdata.description, response['list'], "description")) {
          // console.log(isDuplicate);
          replyEvent(socket, 'created', {room : -1, permanent: false, message : message}, _id);
          return;
  
        };

      } catch ({ message }) {
        console.log('catch... room is duplicated!!!');
        message = 'checking duplicate '+ message;
        replyEvent(socket, 'created', {room : -1, permanent: false, message : message}, _id);
        return;
      }

      try {
        const response = await janodeManagerHandle.create(createdata);
        response.message = '';
        replyEvent(socket, 'created', response, _id);
        Logger.info(`${LOG_NS} ${remote} created sent`);
        console.log(response);
      } catch ({ message }) {
        console.log({room : -1, permanent: false, message : message});
        replyEvent(socket, 'created', {room : -1, permanent: false, message : message}, _id);
        Logger.info(`${LOG_NS} ${remote} error created sent`);

        // error 발생 시, 아래 대신에 replyEvent() 로 대체 함
        // replyError(socket, message, createdata, _id);
      }
    });

    socket.on('destroy', async (evtdata = {}) => {
      Logger.info(`${LOG_NS} ${remote} destroy received`);
      console.log(evtdata);
      const { _id, data: destroydata = {} } = evtdata;

      if (!checkSessions(janodeSession, janodeManagerHandle, socket, evtdata)) return;

      try {
        const response = await janodeManagerHandle.destroy(destroydata);
        console.log(response);
        replyEvent(socket, 'destroyed', response, _id);
        Logger.info(`${LOG_NS} ${remote} destroyed sent`);
      } catch ({ message }) {
        replyError(socket, message, destroydata, _id);
      }
    });

    socket.on('allow', async (evtdata = {}) => {
      Logger.info(`${LOG_NS} ${remote} allow received`);
      console.log(evtdata);
      const { _id, data: allowdata = {} } = evtdata;

      if (!checkSessions(janodeSession, janodeManagerHandle, socket, evtdata)) return;

      try {
        const response = await janodeManagerHandle.allow(allowdata);
        replyEvent(socket, 'allowed', response, _id);
        Logger.info(`${LOG_NS} ${remote} allowed sent`);
      } catch ({ message }) {
        replyError(socket, message, allowdata, _id);
      }
    });

    socket.on('rtp-fwd-start', async (evtdata = {}) => {
      Logger.info(`${LOG_NS} ${remote} rtp-fwd-start received`);
      console.log(evtdata);
      const { _id, data: rtpstartdata = {} } = evtdata;

      if (!checkSessions(janodeSession, janodeManagerHandle, socket, evtdata)) return;

      try {
        const response = await janodeManagerHandle.startForward(rtpstartdata);
        replyEvent(socket, 'rtp-fwd-started', response, _id);
        Logger.info(`${LOG_NS} ${remote} rtp-fwd-started sent`);
      } catch ({ message }) {
        replyError(socket, message, rtpstartdata, _id);
      }
    });

    socket.on('rtp-fwd-stop', async (evtdata = {}) => {
      Logger.info(`${LOG_NS} ${remote} rtp-fwd-stop received`);
      console.log(evtdata);
      const { _id, data: rtpstopdata = {} } = evtdata;

      if (!checkSessions(janodeSession, janodeManagerHandle, socket, evtdata)) return;

      try {
        const response = await janodeManagerHandle.stopForward(rtpstopdata);
        replyEvent(socket, 'rtp-fwd-stopped', response, _id);
        Logger.info(`${LOG_NS} ${remote} rtp-fwd-stopped sent`);
      } catch ({ message }) {
        replyError(socket, message, rtpstopdata, _id);
      }
    });

    socket.on('rtp-fwd-list', async (evtdata = {}) => {
      Logger.info(`${LOG_NS} ${remote} rtp_fwd_list received`);
      console.log(evtdata);
      const { _id, data: rtplistdata = {} } = evtdata;

      if (!checkSessions(janodeSession, janodeManagerHandle, socket, evtdata)) return;

      try {
        const response = await janodeManagerHandle.listForward(rtplistdata);
        replyEvent(socket, 'rtp-fwd-list', response, _id);
        Logger.info(`${LOG_NS} ${remote} rtp-fwd-list sent`);
      } catch ({ message }) {
        replyError(socket, message, rtplistdata, _id);
      }
    });

    /////////////////////////////////////////////////////////////////////////////
    // custom messages
    /////////////////////////////////////////////////////////////////////////////
    socket.on('getRoomId', async (evtdata = {}) => {
      console.log('=========== getRoomId ===================');
      Logger.info(`${LOG_NS} ${remote} getRoomId received as below`);
      console.log(evtdata);
      const { _id, data: getroomid = {} } = evtdata;

      if (!checkSessions(janodeSession, janodeManagerHandle, socket, evtdata)) return;

      try {
        const response = await janodeManagerHandle.exists(getroomid);
        replyEvent(socket, 'getRoomId', response, _id);
        Logger.info(`${LOG_NS} ${remote} getRoomId sent`);
      } catch ({ message }) {
        replyError(socket, message, getroomid, _id);
      }
    });

  });

  // disable caching for all app
  app.set('etag', false).set('view cache', false);
  app.set('view engine','html');  //ejs
  app.engine('html', ejs.renderFile);
  
  // static content
  app.use('/', express.static(__dirname + '/../static/', {
    etag: false,
    lastModified: false,
    maxAge: 0,
  }));

  // Serve images from the 'images' folder within 'static'
  app.use('/images', express.static(__dirname + '/../static/images/', {
    etag: false,
    lastModified: false,
    maxAge: 0,
  }));

  // kill favicon errors
  // Handle favicon request
  app.get('/favicon.ico', (req, res) => res.status(204).end());

  app.get('/', function(req, res) {
    console.log('########################');
    var _url = req.url;
    var queryData = url.parse(_url, true).query;
    console.log(queryData.room_id, queryData.video_flag);
    const room_id = queryData.room_id;  //room id
    const video_flag = queryData.video_flag; //video on or off
    res.render('index.html', {room_id: room_id, video_flag: video_flag});
  });

  app.get('/admin', function(req, res) {
    console.log('########################');
    var _url = req.url;
    var queryData = url.parse(_url, true).query;
    console.log(queryData.room_id, queryData.video_flag);
    const room_id = queryData.room_id;  //room id
    const video_flag = queryData.video_flag; //video on or off
    res.render('index_pagination.html', {room_id: room_id, video_flag: video_flag});
  });

  // Test for unsubscribing 
  app.get('/unsubscribe', function(req, res) {
    console.log('########################');
    var _url = req.url;
    var queryData = url.parse(_url, true).query;
    console.log(queryData.room_id, queryData.video_flag);
    const room_id = queryData.room_id;  //room id
    const video_flag = queryData.video_flag; //video on or off
    res.render('index_unsubscribe.html', {room_id: room_id, video_flag: video_flag});
  });

  app.get('/videoff', function(req, res) {
    console.log('########################');
    var _url = req.url;
    var queryData = url.parse(_url, true).query;
    console.log(queryData.room_id, queryData.video_flag);
    const room_id = queryData.room_id;  //room id
    const video_flag = queryData.video_flag; //video on or off
    res.render('index_videoff.html', {room_id: room_id, video_flag: video_flag});
  });
  
  app.get('/main', function(req, res) {
    console.log('########################');
    var _url = req.url;
    var queryData = url.parse(_url, true).query;
    console.log(queryData.room_id, queryData.video_flag);
    const room_id = queryData.room_id;  //room id
    const video_flag = queryData.video_flag; //video on or off
    res.render('index.html', {room_id: room_id, video_flag: video_flag});
  });

  app.get('/ske', function(req, res) {
    res.render('ske.html', {});
  });
  
  app.get('/multi', function(req, res) {
    // res.render('multi.html', {});
    res.render('multi.html', {});
  });

  // New Multi
  app.get('/test', function(req, res) {
    // res.render('multi_pagination.html', {}); // Made by Peter
    res.render('multi.html', {});
    // res.render('multi_pagination_v1.html', {});
  });

  app.get('/log', function(req, res) {
    var logFolder = './static/log';
    var janusLogFile = '/var/log/janus.log';
    var g_filelist = [];

    try {
      var filelist = readdirSync(logFolder);
      filelist.forEach(filename => {
        var stats = statSync(logFolder+'/'+filename);
        var fileSize = Math.round(stats.size / (1024), 2);
        var ddd = new Date(stats.mtime);
        var fileDate = ddd.getFullYear()+':'+(ddd.getMonth()+1).toString().padStart(2,"0")+':'+ ddd.getDate().toString().padStart(2, "0")+' '+ddd.getHours().toString().padStart(2, "0")+':'+ddd.getMinutes().toString().padStart(2, "0");
        g_filelist.push({"fileName": filename, "fileSize": fileSize, "fileDate": fileDate})
      });
    } catch (err) {
      console.error(err);
    } 

    // console.log("g_filelist=", g_filelist);
    res.render('log.html', {g_filelist: g_filelist});
  });
  app.get('/full', function(req, res) {
    res.render('full.html', {});
  });
  app.get('/org', function(req, res) {
    res.render('index_org.html', {});
  });

  app.get('/audio', function(req, res) {
    res.render('audio_only.html', {title: 'AAAAA'});
  });

  app.get('/1n', function(req, res) {
    res.render('1n.html', {title: 'AAAAA'});
  });



  // http server binding
  return new Promise((resolve, reject) => {
    // web server binding
    httpServer.listen(
      serverConfig.port,
      serverConfig.bind,
      () => {
        Logger.info(`${LOG_NS} server listening on ${(options.key && options.cert) ? 'https' : 'http'}://${serverConfig.bind}:${serverConfig.port}/janode`);
        resolve();
      }
    );

    httpServer.on('error', e => reject(e));
  });
}

function checkSessions(session, handle, socket, { data, _id }) {
  if (!session) {
    replyError(socket, 'session-not-available', data, _id);
    return false;
  }
  if (!handle) {
    replyError(socket, 'handle-not-available', data, _id);
    return false;
  }
  return true;
}

function replyEvent(socket, evtname, data, _id) {
  // console.log('iiindex.js', evtname, data, _id);
  const evtdata = {
    data,
  };
  if (_id) evtdata._id = _id;

  socket.emit(evtname, evtdata);
}

function replyError(socket, message, request, _id) {
  const evtdata = {
    error: message,
  };
  console.log(message);
  if (request) evtdata.request = request;
  if (_id) evtdata._id = _id;

  socket.emit('videoroom-error', evtdata);
}


// app.get('/', function(req, res) {
//   res.render('index.html');
// });