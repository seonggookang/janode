/* eslint-disable multiline-comment-style */
/* eslint-disable no-sparse-arrays */
/* global io $ connect disconnect create_room list_rooms*/

'use strict';

// Set up RTCPeerConnection object
const RTCPeerConnection = (window.RTCPeerConnection || window.webkitRTCPeerConnection || window.mozRTCPeerConnection).bind(window);


// Map keeps track of RTCPeerConnection objects associated with different feeds
const pcMap = new Map();
let pendingOfferMap = new Map();
var myRoom = getURLParameter('room') ? parseInt(getURLParameter('room')) : (getURLParameter('room_str') || 1234);
const randName = ('John_Doe_' + Math.floor(10000 * Math.random()));
const myName = getURLParameter('name') || randName;

// Event Handlings
// Variable initiation
const button = document.getElementById('button');
var localStream;
var frameRate;
var audioSet = false;
var videoSet = true;
var local_pc;
var local_audio_sender;
var local_video_sender;
var local_feed;
var local_display;

// On connect event
connect.onclick = () => {
  if (socket.connected) {
    alert('already connected!');
  }
  else {
    socket.connect();
  }
};

// On disconnect event
disconnect.onclick = () => {
  if (!socket.connected) {
    alert('already disconnected!');
  }
  else {
    socket.disconnect();
  }
};

// Create a new room
create_room.onclick = () => {
  if ($('#new_room_name').val() == '') alert('생성할 방이름을 입력해야 합니다.');
  else _create({ 
    room: generateRandomNumber(), 
    description: $('#new_room_name').val(), 
    max_publishers : 100, 
    audiocodec : 'opus', 
    videocodec : 'vp8', 
    talking_events : true, 
    talking_level_threshold : 25, 
    talking_packets_threshold : 100, 
    permanent : false,
    bitrate: 128000,
    secret: 'adminpwd' });
};
list_rooms.onclick = () => {
  _listRooms();
};


// Leave all available rooms
leave_all.onclick = () => {
  let evtdata = {
    data: {feed: $('#local_feed').text()},
  }
  console.log(evtdata);
  if ($('#local_feed').text() == '') return;
  else _leaveAll({feed: $('#local_feed').text(), display: $('#display_name').val()});
};

// Leave the target room
// leave.onclick = () => {
//   let evtdata = {
//     data: {feed: $('#local_feed').text()},
//   }
//   console.log(evtdata);
//   if ($('#local_feed').text() == '') return;
//   else _leave({feed: parseInt($('#local_feed').text(), 10), display: $('#display_name').val()});
// };

// Unpublish feed (no longer a publisher)
unpublish.onclick = () => {
  if ($('#unpublish').text() == 'Unpublish') {
    if (local_feed) {
      _unpublish({feed : local_feed});
    }
  } else {
    publishOwnFeed();
  }
};


// Utility functions
function getId() {
  return Math.floor(Number.MAX_SAFE_INTEGER * Math.random());
}
function generateRandomNumber() {
  const randomNumber = Math.floor(Math.random() * 1e16).toString().padStart(16, '0');
  return parseInt(randomNumber);
}
function getURLParameter(name) {
  return decodeURIComponent((new RegExp('[?|&]' + name + '=' + '([^&;]+?)(&|#|;|$)').exec(location.search) || [, ''])[1].replace(/\+/g, '%20')) || null;
}

// Scheduling connection attempts
// general connection
const scheduleConnection = (function () {
  let task = null;
  const delay = 5000;

  return (function (secs) {
    if (task) return;
    const timeout = secs * 1000 || delay;
    console.log('scheduled joining in ' + timeout + ' ms');
    task = setTimeout(() => {
      join();
      task = null;
    }, timeout);
  });
})();

// room connection schedule
const scheduleConnection2 = (function (room) {
  console.log('room==='+room);
  let task = null;
  const delay = 5000;

  return (function (secs) {
    if (task) return;
    myRoom = room;
    const timeout = secs * 1000 || delay;
    console.log('scheduled joining222 in ' + timeout + ' ms');
    task = setTimeout(() => {
      join();
      task = null;
    }, timeout);
  });
})();

// socket initiation
// const socket = io("http://0.0.0.0:4443/janode");
const socket = io({
  rejectUnauthorized: false,
  autoConnect: false,
  reconnection: false,
});


// Functions for room actions
// completely destroy target room
function destroy_room(room, desc) {
  if (confirm(desc + ' room을 삭제하겠습니까?')) {
    _destroy({ room : room, permanent : false, secret : 'adminpwd' });
  }
};
  
// Join an hypothetical room: soon to be deleted
function join22(room, desc) {
  var display_name = $('#display_name').val();
  if (display_name == '') {
    alert('참석할 이름을 입력해야 합니다.');
    return;
  }
  join({room: room, display:display_name, token:null});
}

// Join an available room
function join({ room = myRoom, display = myName, token = null }) {
  const joinData = {
    room,
    display,
    token,
  };
  socket.emit('join', {
    data: joinData,
    _id: getId(),
  });
}

// Subscribe to an available room
function subscribe({ feed, streams, room = myRoom, substream, temporal}) {
  const subscribeData = {
    room,
    feed
  };

  if (Array.isArray(streams)) subscribeData.streams = streams;
  if (typeof substream !== 'undefined') subscribeData.sc_substream_layer = substream;
  if (typeof temporal !== 'undefined') subscribeData.sc_temporal_layers = temporal;

  socket.emit('subscribe', {
    data: subscribeData,
    _id: getId(),
  });
}


function subscribeTo(peers, room = myRoom) {
  peers.forEach(({ feed }) => {
    console.log("================ subscribeToPeers =============", myRoom, peers)
    subscribe({ feed, room });
  });
}

function trickle({ feed, candidate }) {
  const trickleData = candidate ? { candidate } : {};
  trickleData.feed = feed;
  const trickleEvent = candidate ? 'trickle' : 'trickle-complete';

  socket.emit(trickleEvent, {
    data: trickleData,
    _id: getId(),
  });
}

function update(subscribe, unsubscribe) {
  let configureData = {};
  
  if (subscribe){
    configureData.subscribe = subscribe;
  } 

  if (unsubscribe){
    configureData.unsubscribe = unsubscribe;
  }

  const configId = getId();

  socket.emit('update', {
    data: configureData,
    _id: configId,
  });
}

function configure({ feed, jsep, restart, substream, temporal, just_configure, video, offer_video, streams }) {
  var v_just_configure;
  const configureData = {
    feed,
    audio: audioSet,
    video,
    offer_video,
    data: true,
    restart,
    streams
  };
  if (typeof substream !== 'undefined') configureData.sc_substream_layer = substream;
  if (typeof temporal !== 'undefined') configureData.sc_temporal_layers = temporal;
  if (jsep) configureData.jsep = jsep;
  if (typeof restart === 'boolean') configureData.restart = restart;
  if (typeof video === 'boolean') configureData.video = video;
  if (streams && Array.isArray(streams)) configureData.streams = streams;
  if (typeof audio === 'boolean') configureData.audio = audio;
  if (typeof offer_video === 'boolean') configureData.offer_video = offer_video;
  if (typeof just_configure !== 'undefined') v_just_configure = just_configure;
  else v_just_configure = false;

  const configId = getId();
  socket.emit('configure', {
    data: configureData,
    _id: configId,
    just_configure: v_just_configure,
  });
  
  if (jsep) pendingOfferMap.set(configId, { feed });
}


async function configure_bitrate_audio_video(mode, bitrate=0) {
  console.log("================ configure_bitrate_audio_video =============");
  var feed = parseInt($('#local_feed').text());

  // Configure the bitrate
  if (mode == 'bitrate') {
    var configureData = {
      feed,
      bitrate: bitrate,
    };
    console.log({
      data: configureData,
      _id: getId(),
    });
    console.log(bitrate / 1000);
    var bitrate_label = ((bitrate / 1000) > 1000) ? (bitrate / 1000 / 1000) + 'M' : (bitrate / 1000) + 'K';
    $('#Bandwidth_label').text(bitrate_label);
    socket.emit('configure', {
      data: configureData,
      _id: getId(),
    });
  
   
  } else if (mode =='audio') {
    // 오디오를 끄는 것이면,
    if ($('#audioset').hasClass('btn-primary')) {
      $('#audioset').removeClass('btn-primary').addClass('btn-warning');
      audioSet = false;

      const audioTrack = localStream.getAudioTracks()[0];
      if (audioTrack) {
        // 오디오를 끄거나 켤 수 있는 상태인지 확인합니다.
        const isAudioEnabled = audioTrack.enabled;
      
        if (isAudioEnabled) {
          // 오디오를 끕니다.
          audioTrack.enabled = false;
        } else {
          // 오디오를 켭니다.
          audioTrack.enabled = true;
        }
      } else {
      }
    } else {
    // 오디오를 켜는 것이면,
    $('#audioset').removeClass('btn-warning').addClass('btn-primary');
      audioSet = true;

      const audioTrack = localStream.getAudioTracks()[0];
      if (audioTrack) {
        // 오디오를 끄거나 켤 수 있는 상태인지 확인합니다.
        const isAudioEnabled = audioTrack.enabled;
      
        if (isAudioEnabled) {
          // 오디오를 끕니다.
          audioTrack.enabled = false;
        } else {
          // 오디오를 켭니다.
          audioTrack.enabled = true;
        }
      } else {
      }         
    }
  } else {
    //비디오를 끄는 것이면
    if ($('#videoset').hasClass('btn-primary')) {
      $('#videoset').removeClass('btn-primary').addClass('btn-warning');
      // 미디어 스트림에서 비디오 트랙을 가져옵니다.
      const videoTrack = localStream.getVideoTracks()[0];

      // 비디오 트랙이 있는지 확인합니다.
      if (videoTrack) {
        // 비디오를 끄거나 켤 수 있는 상태인지 확인합니다.
        const isVideoEnabled = videoTrack.enabled;

        if (isVideoEnabled) {
          // 비디오를 끕니다.
          videoTrack.enabled = false;
        } else {
          // 비디오를 켭니다.
          videoTrack.enabled = true;
        }
      } else {
      }  
      
      try {
      } catch (e) {
        console.log('error while doing offer for changing', e);
        return;
      }
    } else {
      //비디오를 켜는 것이면,
      $('#videoset').removeClass('btn-warning').addClass('btn-primary');

      // 미디어 스트림에서 비디오 트랙을 가져옵니다.
      const videoTrack = localStream.getVideoTracks()[0];

      // 비디오 트랙이 있는지 확인합니다.
      if (videoTrack) {
        // 비디오를 끄거나 켤 수 있는 상태인지 확인합니다.
        const isVideoEnabled = videoTrack.enabled;

        if (isVideoEnabled) {
          // 비디오를 끕니다.
          videoTrack.enabled = false;
        } else {
          // 비디오를 켭니다.
          videoTrack.enabled = true;
        }
      } else {
      } 
      
      try {
      } catch (e) {
        console.log('error while doing offer for changing', e);
        return;
      }
    }
  }

}

async function publishOwnFeed() {
  try {
    const offer = await doOffer(local_feed, local_display, false);
    configure({ feed: local_feed, jsep: offer, just_configure: false });
    $('#unpublish').text('Unpublish');
  } catch (e) {
    console.log('error while doing offer in publishOwnFeed()', e);
  }

}

function _unpublish({ feed }) {
  const unpublishData = {
    feed,
  };

  console.log('unpublish sent as below ', getDateTime());
  console.log({
    data: unpublishData,
    _id: getId(),
  });
  socket.emit('unpublish', {
    data: unpublishData,
    _id: getId(),
  });
}

function _leave({ feed, display }) {
  const leaveData = {
    feed,
    display,
  };

  console.log('leave sent as below ', getDateTime());
  console.log({
    data: leaveData,
    _id: getId(),
  });

  socket.emit('leave', {
    data: leaveData,
    _id: getId(),
  });
}
function _leaveAll({ feed, display }) {
  const leaveData = {
    feed,
    display,
  };

  console.log('leaveAll sent as below ', getDateTime());
  console.log({
    data: leaveData,
    _id: getId(),
  });
  socket.emit('leaveAll', {
    data: leaveData,
    _id: getId(),
  });
}

function _listParticipants({ room = myRoom } = {}) {
  const listData = {
    room,
  };

  console.log('list-participants sent as below ', getDateTime());
  console.log({
    data: listData,
    _id: getId(),
  });
  socket.emit('list-participants', {
    data: listData,
    _id: getId(),
  });
}

function _kick({ feed, room = myRoom, secret = 'adminpwd' }) {
  const kickData = {
    room,
    feed,
    secret,
  };

  console.log('kick sent as below ', getDateTime());
  console.log({
    data: kickData,
    _id: getId(),
  });
  socket.emit('kick', {
    data: kickData,
    _id: getId(),
  });
}

function start({ feed, jsep = null }) {
  const startData = {
    feed,
    jsep,
  };

  console.log('start sent as below ', getDateTime());
  socket.emit('start', {
    data: startData,
    _id: getId(),
  });
}

function _pause({ feed }) {
  console.log("================ _pause =============");
  const pauseData = {
    feed,
  };

  console.log('pause sent as below ', getDateTime());
  console.log({
    data: pauseData,
    _id: getId(),
  });
  socket.emit('pause', {
    data: pauseData,
    _id: getId(),
  });
}


function _switch({ from_feed, to_feed, audio = true, video = true, data = false }) {
  console.log("================ _switch =============");
  const switchData = {
    from_feed,
    to_feed,
    audio,
    video,
    data,
  };

  console.log('switch sent as below ', getDateTime());
  console.log({
    data: switchData,
    _id: getId(),
  });
  socket.emit('switch', {
    data: switchData,
    _id: getId(),
  });
}

function _exists({ room = myRoom } = {}) {
  console.log("================ _exists =============");
  const existsData = {
    room,
  };

  console.log('exists sent as below ', getDateTime());
  console.log({
    data: existsData,
    _id: getId(),
  });
  socket.emit('exists', {
    data: existsData,
    _id: getId(),
  });
}

function _listRooms() {
  console.log("================ _listRooms =============");
  console.log('list-rooms sent as below ', getDateTime());
  console.log({
    _id: getId(),
  });

  socket.emit('list-rooms', {
    _id: getId(),
  });
}

function _create({ room, description, max_publishers = 6, audiocodec = 'opus', videocodec = 'vp8', talking_events = true, talking_level_threshold = 25, talking_packets_threshold = 100, permanent = false, bitrate = 128000 }) {
  console.log("================ _create =============");
  console.log('create sent as below ', getDateTime());
  console.log({
    data: {
      room,
      description,
      max_publishers,
      audiocodec,
      videocodec,
      talking_events,
      talking_level_threshold,
      talking_packets_threshold,
      permanent,
      bitrate,
      secret: 'adminpwd',
    },
    _id: getId(),
  });
  socket.emit('create', {
    data: {
      room,
      description,
      max_publishers,
      audiocodec,
      videocodec,
      talking_events,
      talking_level_threshold,
      talking_packets_threshold,
      permanent,
      bitrate,
      secret: 'adminpwd',
    },
    _id: getId(),
  });
}

function _destroy({ room = myRoom, permanent = false, secret = 'adminpwd' }) {
  console.log("================ _destroy =============");
  console.log('destroy sent as below ', getDateTime());
  console.log({
    data: {
      room,
      permanent,
      secret,
    },
    _id: getId(),
  });
  socket.emit('destroy', {
    data: {
      room,
      permanent,
      secret,
    },
    _id: getId(),
  });
}

// add remove enable disable token mgmt
function _allow({ room = myRoom, action, token, secret = 'adminpwd' }) {
  console.log("================ _allow =============");
  const allowData = {
    room,
    action,
    secret,
  };
  if (action != 'disable' && token) allowData.list = [token];

  console.log('allow sent as below ', getDateTime());
  console.log({
    data: allowData,
    _id: getId(),
  });
  socket.emit('allow', {
    data: allowData,
    _id: getId(),
  });
}

function _startForward({ feed, room = myRoom, host = 'localhost', audio_port, video_port, data_port = null, secret = 'adminpwd' }) {
  console.log("================ _startForward =============");
  console.log('rtp-fwd-start sent as below ', getDateTime());
  console.log({
    data: {
      room,
      feed,
      host,
      audio_port,
      video_port,
      data_port,
      secret,
    },
    _id: getId(),
  });
  socket.emit('rtp-fwd-start', {
    data: {
      room,
      feed,
      host,
      audio_port,
      video_port,
      data_port,
      secret,
    },
    _id: getId(),
  });
}

function _stopForward({ stream, feed, room = myRoom, secret = 'adminpwd' }) {
  console.log("================ _stopForward =============");
  console.log('rtp-fwd-stop sent as below ', getDateTime());
  console.log({
    data: {
      room,
      stream,
      feed,
      secret,
    },
    _id: getId(),
  });
  socket.emit('rtp-fwd-stop', {
    data: {
      room,
      stream,
      feed,
      secret,
    },
    _id: getId(),
  });
}

function _listForward({ room = myRoom, secret = 'adminpwd' }) {
  console.log("================ _listForward =============");
  console.log('rtp-fwd-list sent as below ', getDateTime());
  console.log({
    data: { room, secret },
    _id: getId(),
  });
  socket.emit('rtp-fwd-list', {
    data: { room, secret },
    _id: getId(),
  });
}

socket.on('connect', () => {
  console.log('socket connected');
  $('#connect_status').val('connected');
  _listRooms();
  $('#connect').prop('disabled', true);
  $('#disconnect, #create_room, #list_rooms' ).prop('disabled', false);

  //url 에 room_id 가 있으면 바로 
  const room_id = $('#curr_room_name').attr('room_id');;
  console.log('room_id = ', room_id);
  if (room_id != '') {
    join22(parseInt(room_id));
  }
  
  socket.sendBuffer = [];
});

socket.on('disconnect', () => {
  console.log('socket disconnected');
  $('#connect_status').val('disconnected');
  $('#room_list').html('');
  $('#connect').prop('disabled', false);
  $('#disconnect, #create_room, #list_rooms, #leave_all' ).prop('disabled', true);
  pendingOfferMap.clear();
  removeAllVideoElements();
  closeAllPCs();
});

socket.on('leaveAll', ({ data }) => {
  console.log('leaved all rooms', data);
  pendingOfferMap.clear();
  $('#leave_all').prop('disabled', true);
  $('#curr_room_name').val('');
  

  removeAllVideoElements();
  closeAllPCs();
  $('#local_feed').text('');
  $('#private_id').text('');
  _listRooms();

});

socket.on('videoroom-error', ({ error, _id }) => {
  // alert(error);
  console.log('videoroom error', error);
  if (error === 'backend-failure' || error === 'session-not-available') {
    socket.disconnect();
    return;
  }
  if (pendingOfferMap.has(_id)) {
    const { feed } = pendingOfferMap.get(_id);
    removeVideoElementByFeed(feed);
    closePC(feed);
    pendingOfferMap.delete(_id);
    return;
  }
});

socket.on('joined', async ({ data }) => {

  $('#local_feed').text(data.feed);
  $('#private_id').text(data.private_id);
  $('#curr_room_name').val(data.description);
  $('#leave_all').prop('disabled', false);
  _listRooms();
  
  setLocalVideoElement(null, null, null, data.room);

  try {
    const offer = await doOffer(data.feed, data.display, false);
    
    configure({ feed: data.feed, jsep: offer, just_configure: false });
    subscribeTo(data.publishers, data.room);

    //url에 video_flag=off 이면 video를 끔
    const video_flag = $('#curr_room_name').attr('video_flag');;
    // console.log('video_flag = ', video_flag);
    
    // creating a custom variable to set video to ON and OFF. not relevant now
    if (video_flag == 'off') {
      console.log('video_flag=', video_flag, ' so making video off...');
      configure_bitrate_audio_video('video');
    } else {

      var vidTrack = localStream.getVideoTracks();
      vidTrack.forEach(track => track.enabled = true);
      var vidTrack = localStream.getAudioTracks();
      vidTrack.forEach(track => track.enabled = true);
    }
    configure_bitrate_audio_video('audio');
  
  } catch (e) {
    console.log('error while doing offer', e);
  }
});

socket.on('subscribed', async ({ data }) => {
  console.log('subscribed to feed as below', getDateTime());
  console.log(data);

  try {
    const answer = await doAnswer(data.feed, data.display, data.jsep);
    start({ feed: data.feed, jsep: answer });
    _listRooms();
  } catch (e) { console.log('error while doing answer', e); }
});

socket.on('participants-list', ({ data }) => {
  console.log('participants list', getDateTime());
  console.log(data);
});

socket.on('talking', ({ data }) => {
  console.log('talking notify', getDateTime());
  console.log(data);
  setRemoteVideoElement(null, data.feed, null, data.talking);
});

socket.on('kicked', ({ data }) => {
  console.log('participant kicked', getDateTime());
  console.log(data);
  if (data.feed) {
    removeVideoElementByFeed(data.feed);
    closePC(data.feed);
  }
});

socket.on('allowed', ({ data }) => {
  console.log('token management', getDateTime());
  console.log(data);
});


socket.on('configured', async ({ data, _id }) => {
  pendingOfferMap.delete(_id);
  const pc = pcMap.get(data.feed);
  if (pc && data.jsep) {
    try {
      await pc.setRemoteDescription(data.jsep);
      console.log('configure remote sdp OK');
      if (data.jsep.type === 'offer') {
        const answer = await doAnswer(data.feed, null, data.jsep);
        
        // Data sent to start ICE function 
        const startData = {feed: data.feed, jsep: answer}
        start(startData);
        _listRooms();
      }
    } catch (e) {
      console.log('error setting remote sdp', e);
    }
  }
});

socket.on('updated', async ({ data, _id }) => {
  console.log('updated to feed as below', getDateTime());
  console.log('data in updated >>>>> ', data);

  // 실험중일 때 나오는 값 ----->  { room : 1234 }
  // 버튼을 클릭하면 나오는 값 ----> {jsep: {…}, room: 1234, streams: Array(2)}

  try {
    const answer = await doAnswer(data.streams[0].feed_id, data.streams[0].feed_display, data.jsep);
    start({ feed: data.streams[0].feed_id, jsep: answer });
    _listRooms();
  } catch (e) { console.log('error while doing answer', e); }
});


socket.on('display', ({ data }) => {
  console.log('feed changed display name ', getDateTime());
  console.log(data);
  setRemoteVideoElement(null, data.streams[0].feed_id, data.display);
});

socket.on('started', ({ data }) => {
  console.log('=========subscribed feed started ========', getDateTime());
  console.log("========= Started data=========", data);

  setRemoteVideoElement(null, data.feed, null);
});

socket.on('paused', ({ data }) => {
  console.log('feed paused', getDateTime());
  console.log(data);
});

socket.on('switched', ({ data }) => {
  console.log(`feed switched from ${data.from_feed} to ${data.to_feed} (${data.display})`);
  /* !!! This will actually break the DOM management since IDs are feed based !!! */
  setRemoteVideoElement(null, data.from_feed, data.display);
});

socket.on('feed-list', ({ data }) => {
  // alert('new feeds available'); 
  console.log('new feeds available! ', getDateTime());
  console.log(pcMap);
  console.log(data);
  let data_room = data.room;
  // subscribeTo(data.publishers, data.room);
  data.publishers.forEach(({ feed }) => {
    console.log({ feed, data_room }, 'feed=', feed);
    if (pcMap.has(feed)) {
      console.log('이미 있는 feed 임. No need to subscribe');
    } else {
      subscribe({feed, room : data_room});
    }
  });
});

socket.on('unpublished', ({ data }) => {
  // 상대방도 이 이벤트 발생
  console.log('feed unpublished ', getDateTime());
  console.log(data);
  if (data.feed) {
    removeVideoElementByFeed(data.feed);
    closePC(data.feed);
  }
  if (data.feed == local_feed) {
    $('#unpublish').text('Publish');
  }
});

socket.on('leaving', ({ data }) => {
  console.log('feed leaving', data);
  if (data.feed) {
    removeVideoElementByFeed(data.feed);
    closePC(data.feed);
    renderPage(currentPage);
  }
  _listRooms();
});

socket.on('leaving111', ({ data }) => {
  console.log('feed leaving', getDateTime());
  console.log(data);
  _listRooms();

  if (data.feed) {
    if (data.who_is_leaving == 'me') {
      removeAllVideoElements();
      $('#local_feed').text('');
      $('#private_id').text('');
      closeAllPCs();
    } else {
      removeVideoElementByFeed(data.feed);
      closePC(data.feed);
    }
  }
});

socket.on('exists', ({ data }) => {
  console.log('room exists ', getDateTime());
  console.log(data);
});

socket.on('rooms-list', ({ data }) => {
  var parsedData = JSON.parse(data);
  console.log('========= rooms-list form server======', parsedData)

  console.log("========Hide destroy button for Room 1111, 2222, 1234========")
  $('#room_list').html('');
  parsedData.forEach(rooms => {
    var display_style = '';
    if ([1234, 1111, 2222].includes(rooms.room)) {
      display_style="display:none;";
    } else {
      display_style = '';
    } 
    $('#room_list').html($('#room_list').html()+"<br>"+rooms.description+"("+rooms.num_participants+"/"+rooms.max_publishers+")&nbsp;<button class='btn btn-primary btn-xs' onclick='join22("+rooms.room+", \""+rooms.description+"\");'>join</button>&nbsp;"+"<button class='btn btn-primary btn-xs' style='"+display_style+"' onclick='destroy_room("+rooms.room+", \""+rooms.description+"\");'>destroy</button>");
    
  });
});

socket.on('created', ({ data }) => {
  if (data.room == -1) {
    alert('room 이 중복되었습니다.');
    return;
  } else {
    console.log('room created', data);
    $('#new_room_name').val('');
    _listRooms();
  }
});

socket.on('destroyed', ({ data }) => {
  console.log('room destroyed', data);
  _listRooms();
  // if (data.room === myRoom) {
  //   socket.disconnect();
  // }
});

socket.on('rtp-fwd-started', ({ data }) => {
  console.log('rtp forwarding started', data);
});

socket.on('rtp-fwd-stopped', ({ data }) => {
  console.log('rtp forwarding stopped', data);
});

socket.on('rtp-fwd-list', ({ data }) => {
  console.log('rtp forwarders list', data);
});

async function _restartPublisher(feed) {
  const offer = await doOffer(feed, null);
  configure({ feed, jsep: offer, just_configure: false });
}

async function _subscribeUpdate(feed) {
  update([{ 'type': 'video', 'mid' : '1', 'feed': feed }], null);
}

async function _unsubscribeUpdate(feed) {
  update(null, [{ 'type': 'video', 'mid' : '1', 'feed': feed, 'send': false }]);
}


async function doOffer(feed, display) {

  console.log('========= doOffer received data: feed=', feed, 'display=', display);

  if (!pcMap.has(feed)) {
    const pc = new RTCPeerConnection({
      'iceServers': [{
        urls: 'stun:stun.l.google.com:19302'
      }],
    });

    // Storing the current state of the pc into a variable called "local_pc"
    local_pc = pc;

    pc.onnegotiationneeded = event => console.log('pc.onnegotiationneeded doOffer', event);
    pc.onicecandidate = event => trickle({ feed, candidate: event.candidate });
    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'closed') {
        removeVideoElementByFeed(feed);
        closePC(feed);
      }
    };
    /* This one below should not be fired, cause the PC is used just to send */
    pc.ontrack = event => console.log('pc.ontrack', event);
    pcMap.set(feed, pc);
    local_feed = feed;
    local_display = display;

    try {
      frameRate = parseInt($('#frame_rate').val());
      console.log('========frame_rate=', $('#frame_rate').val());

      // Get my local stream and custom options
      localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: { frameRate: { ideal: frameRate, max: frameRate } } });
      
      // For each stream in my local, add to the pc
      localStream.getTracks().forEach(track => {
        
        if (track.kind == 'audio') {

          // the audio track and localstream are added to the pc
          local_audio_sender = pc.addTrack(track, localStream);
        }
        else {
          // the video track and localstream are added to the pc
          local_video_sender = pc.addTrack(track, localStream);

        }
      });
      setLocalVideoElement(localStream, feed, display);

    } catch (e) {
      console.log('error while doing offer', e);
      removeVideoElementByFeed(feed);
      closePC(feed);
      return;
    }
  }
  else {
    console.log('Performing ICE restart');
    pcMap.get(feed).restartIce();
  }

  try {
    const pc = pcMap.get(feed);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    console.log('set local sdp OK');
    return offer;
  } catch (e) {
    console.log('error while doing offer', e);
    removeVideoElementByFeed(feed);
    closePC(feed);
    return;
  }

}

// Asynchronous function to handle answering an offer
async function doAnswer(feed, display, offer) {
  console.log('doAnswer().. feed=', feed, 'display=', display, 'offer=', offer);

  // Check if the RTCPeerConnection for the given feed already exists in the pcMap
  if (!pcMap.has(feed)) {
    console.log('========doAnswer', feed,' feed does not exist in the RTCPeerConnection');
    const pc = new RTCPeerConnection({
      'iceServers': [{
        urls: 'stun:stun.l.google.com:19302'
      }],
    });

    pc.onnegotiationneeded = event => console.log('pc.onnegotiationneeded doAnswer', event);
    pc.onicecandidate = event => trickle({ feed, candidate: event.candidate });
    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'closed') {
        removeVideoElementByFeed(feed);
        closePC(feed);
      }
    };
    pc.ontrack = event => {
      console.log('pc.ontrack', event);

      event.track.onunmute = evt => {
        console.log('track.onunmute', evt);	
      };
      event.track.onmute = evt => {
        console.log('track.onmute', evt);
      };
      event.track.onended = evt => {
        console.log('track.onended', evt);
      };

      
      const remoteStream = event.streams[0];
      setRemoteVideoElement(remoteStream, feed, display);
    };

    pcMap.set(feed, pc);
  }

  const pc = pcMap.get(feed);

  try {
    await pc.setRemoteDescription(offer);
    console.log('set remote sdp OK ', offer.type);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    console.log('set local sdp OK as below');
    console.log(pc);
    return answer;
  } catch (e) {
    console.log('error creating subscriber answer', e);
    removeVideoElementByFeed(feed);
    closePC(feed);
    throw e;
  }
}

// Function to set up the local video element
function setLocalVideoElement(localStream, feed, display, room) {

  // If a room is specified, update the room information in the HTML
  if (room) document.getElementById('videos').getElementsByTagName('span')[0].innerHTML = '   --- VIDEOROOM (' + room + ') ---  ';
  
  // Check if the feed is undefined or null, return if true
  if (!feed) return;

  // Check if the video element with the given feed ID already exists
  if (!document.getElementById('video_' + feed)) {
    // Create a span element to display the name and feed ID
    const nameElem = document.createElement('span');
    nameElem.innerHTML = display + ' (' + feed + ')';
    nameElem.style.display = 'table';

    // Create a video element for the local stream
    const localVideoStreamElem = document.createElement('video');
    localVideoStreamElem.width = 320;
    localVideoStreamElem.height = 240;
    localVideoStreamElem.autoplay = true;
    localVideoStreamElem.muted = 'muted'; // Mute the local video
    localVideoStreamElem.style.cssText = '-moz-transform: scale(-1, 1); -webkit-transform: scale(-1, 1); -o-transform: scale(-1, 1); transform: scale(-1, 1); filter: FlipH;';
    localVideoStreamElem.id = feed;

    // Create an image for no video
    const noImageElem = document.createElement('img')
    noImageElem.src = '/images/sydney.png'
    noImageElem.width = 320;
    noImageElem.height = 240;

    // If the localStream is provided, create a the video element and set the localstream as the source for the video element 
    if (localStream) {
      localVideoStreamElem.srcObject = localStream;

      // const audioTracks = localStream.getAudioTracks()
      const videoTracks = localStream.getVideoTracks()

      if (videoTracks.length === 0){
        localVideoStreamElem.style.display = 'none'
        noImageElem.style.display = 'block';
      } else{
        localVideoStreamElem.style.display = 'block'
        noImageElem.style.display = 'none';
      }
    } else{
      noImageElem.style.display = 'none'; 
    }    

    // Create a container div for the local video (without video element)
    // **** the create container div could have been moved out of the if statement
    const localVideoContainer = document.createElement('div')
    localVideoContainer.id = 'video_' + feed
    localVideoContainer.appendChild(nameElem)
    localVideoContainer.appendChild(localVideoStreamElem);
    localVideoContainer.appendChild(noImageElem)

    // Append the container to the 'locals' element in the HTML
    document.getElementById('locals').appendChild(localVideoContainer)
    
  }
  else {
    // If the video element already exists, update its properties 
    const localVideoContainer = document.getElementById('video_' + feed);
    const localVideoStreamElem = document.getElementById(feed);

    // Create an image for no video
    const noImageElem = document.createElement('img');
    noImageElem.src = '/images/sydney.png';
    noImageElem.width = 320;
    noImageElem.height = 240;

    // Update the display name if provided
    if (display) {
      const nameElem = localVideoContainer.getElementsByTagName('span')[0];
      nameElem.innerHTML = display + ' (' + feed + ')';
    }

    // Check if localStream is provided
    if (localStream){
      console.log('======== localStream ============', feed);
      localVideoStreamElem.srcObject = localStream;

      // const audioTracks = localStream.getAudioTracks()
      const videoTracks = localStream.getVideoTracks()

      if (videoTracks.length === 0){
        localVideoStreamElem.style.display = 'none'
        noImageElem.style.display = 'block';
      } else{
        localVideoStreamElem.style.display = 'block'
        noImageElem.style.display = 'none';
      }


    }else{
      noImageElem.style.display = 'none';
      // remoteVideoStreamElem.style.display = 'none'
    }
  }
}

const itemsPerPage = 1;
let currentPage = 1;

// 페이지 네이션 버튼 클릭
document.getElementById('js-pagination').addEventListener('click', (event) => {
  if (event.target.tagName === 'BUTTON') {
    currentPage = parseInt(event.target.textContent);
    renderPage(currentPage);
  }
});

function renderPage(pageNumber) {

  console.log('currentPage >>> ', currentPage);
  console.log('remote peer가 들어오면 시작');
  const startIndex = (pageNumber - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const remoteContainers = document.querySelectorAll('#remotes > div');
  const paginationContainer = document.getElementById('js-pagination');
  paginationContainer.innerHTML = '';

  // remoteContainers가 비어 있는 경우 함수 종료
  if (remoteContainers.length === 0) {
    return;
  }

  console.log('remoteContainers >>> ', remoteContainers);

  // _subscribeUpdate(Number(container.id.split('_')[1]));
  remoteContainers.forEach((container, index) => { // 여기에다가
    console.log('container in renderpage>>> ', container);
    console.log('index in renderpage >>> ', index);
    

    // _subscribeUpdate(Number(container.id.split('_')[1]));
    if (index >= startIndex && index < endIndex) { // current page가 1이면 start는 0, endindex는 1. 맨 앞에 나온거에 대해 보여주며 subscribe해야됨
      container.style.display = 'block';
      _subscribeUpdate(Number(container.id.split('_')[1]));
      
    } else {
      container.style.display = 'block';
      _unsubscribeUpdate(Number(container.id.split('_')[1]));
    }
  });

  // 따로 만들어줘야할 듯
  // 위 remoteContainers는 remote 전체 배열을
  
  const totalItems = remoteContainers.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  
  if (pageNumber > totalPages) {
    currentPage = totalPages > 0 ? totalPages : 1;
    return renderPage(currentPage);
  }
  
  for (let i = 1; i <= totalPages; i++) {
    const pageButton = document.createElement('button');
    pageButton.textContent = i;
    pageButton.className = 'pagination-button';

    if (i === pageNumber) {
      pageButton.classList.add('clicked');
    }
    paginationContainer.appendChild(pageButton);
  } 
}

// Function to set the remote video element
function setRemoteVideoElement(remoteStream, feed, display, talking=null) {
  console.log('js-pagination button >>>> ', document.querySelector('#js-pagination button'));
  console.log('1번 버튼이 있나? >>> ', document.querySelector('.pagination-button'));
  console.log(document.querySelector('#js-pagination button')=== document.querySelector('.pagination-button'));
  
  // If no feed exists just exit
  if (!feed) return;
  const divCount = document.querySelectorAll('#remotes > div').length;
  console.log('div 태그 갯수 >>>  ', divCount);

  
  // Check if the remote video element with the given feed ID already exists
  if (!document.getElementById('video_' + feed)) {

    // 페이지를 렌더링하는 로직
    // 예를 들어, 첫 번째 페이지로 강제 이동
    
    // if(divCount === 0){
      
    // }
    // if( currentPage === 1 ) {
      
    const firstPageButton = document.querySelector('#js-pagination button:first-child');
    
    if (firstPageButton) {
      firstPageButton.click();
    }  
    // }
    
    

    console.log('===========inside remoteElement, feed element doesnt exist========')
    // Create a new span element to display the user's name and feed ID
    const nameElem = document.createElement('span');
    const onlyAudio_btn = "<button onclick='_unsubscribeUpdate("+feed+");' class='btn btn-primary btn-xs' style='margin-left:2px;'>Audio Only</button>";
    const audioVideo_btn = "<button onclick='_subscribeUpdate("+feed+");' class='btn btn-primary btn-xs' style='margin-left:2px;'>Audio Video</button>";
    nameElem.innerHTML = display + ' (' + feed + ')' + onlyAudio_btn + audioVideo_btn;
    nameElem.style.display = 'table';
    

    // Create a new video element for displaying the remote stream
    const remoteVideoStreamElem = document.createElement('video');
    remoteVideoStreamElem.width = 320;
    remoteVideoStreamElem.height = 240;
    remoteVideoStreamElem.autoplay = true;
    remoteVideoStreamElem.style.cssText = '-moz-transform: scale(-1, 1); -webkit-transform: scale(-1, 1); -o-transform: scale(-1, 1); transform: scale(-1, 1); filter: FlipH;';
    remoteVideoStreamElem.setAttribute('feed', feed);
    remoteVideoStreamElem.id = feed;


    // Create an image for no video
    const noImageElem = document.createElement('img');
    noImageElem.src = '/images/sydney.png';
    noImageElem.width = 320;
    noImageElem.height = 240;
    noImageElem.id = `photo_${feed}`;    
    
    

    // If the remoteStream is provided, set it as the source for the video element
    if (remoteStream) {
      console.log('remoteStream >>> ', remoteStream);
      remoteVideoStreamElem.srcObject = remoteStream;
      console.log('remoteStream.getTracks() >>>>> ', remoteStream.getTracks()); // audio만 나오고 있음
      // const audioTracks = remoteStream.getAudioTracks()
      const videoTracks = remoteStream.getVideoTracks();
      console.log('videoTracks.length 111 >>>>> ', videoTracks);
      console.log('currentPage in setRemoteVideoElement >>> ', currentPage);
      if (videoTracks.length === 0) {
        console.log('videoTracks.length 222 >>> ', videoTracks.length);
        
        remoteVideoStreamElem.style.display = 'none';
        noImageElem.style.display = 'block';
        // _subscribeUpdate(feed);
      } else {
        console.log('videoTracks.length 333 >>> ', videoTracks.length);
        remoteVideoStreamElem.style.display = 'block';
        noImageElem.style.display = 'none';
      }
    } else {
      noImageElem.style.display = 'none';
    }

    // Create a container div for the remote video 
    const remoteVideoContainer = document.createElement('div');
    remoteVideoContainer.id = 'video_' + feed;
    remoteVideoContainer.classList.add('remote-container');
    remoteVideoContainer.appendChild(nameElem);
    remoteVideoContainer.appendChild(remoteVideoStreamElem);
    remoteVideoContainer.appendChild(noImageElem);

    // Append the container to the 'remotes' element in the HTML
    document.getElementById('remotes').appendChild(remoteVideoContainer);
    
    // renderPage(currentPage);
    // 최초로 remotepeer가 입장하고 currentPage가 1일 때 _subscribeUpdate(feed) 실행
    // console.log('feed >>>>>>>>> ', feed);
    // if (currentPage === 1) {
    //   _subscribeUpdate(feed);
    // } else {
    //   return;
    // }

    const remoteContainers = document.querySelectorAll('.remote-container');
    const paginationContainer = document.getElementById('js-pagination');
    
    paginationContainer.innerHTML = '';
    
    const totalItems = remoteContainers.length;
    const totalPages = Math.ceil(totalItems / itemsPerPage);
    
    for (let i = 1; i <= totalPages; i++) {
      const pageButton = document.createElement('button');
      pageButton.textContent = i;
      pageButton.className = 'pagination-button';
      
      if(i === currentPage) {
        pageButton.classList.add('clicked');
      } 
      
      paginationContainer.appendChild(pageButton); 
    }

  }

  // If the video element already exists, update its properties
  else {
    console.log('===========inside remoteElement, feed element exist========')
    // Get the video container by its feed
    const remoteVideoContainer = document.getElementById('video_' + feed);
    // remoteVideoContainer.innerHTML = ''; // Clear existing elements
    const remoteVideoStreamElem = document.getElementById(feed);
    const noImageElem = document.getElementById(`photo_${feed}`);

    if (display) {
      const nameElem = remoteVideoContainer.getElementsByTagName('span')[0];
      const onlyAudio_btn = "<button onclick='_unsubscribeUpdate("+feed+");' class='btn btn-primary btn-xs' style='margin-left:2px;'>Audio Only</button>";
      const audioVideo_btn = "<button onclick='_subscribeUpdate("+feed+");' class='btn btn-primary btn-xs' style='margin-left:2px;'>Audio Video</button>";
      nameElem.innerHTML = display + ' (' + feed + ')' + onlyAudio_btn + audioVideo_btn;
    }

    // If the remoteStream is provided, update the source for the video element
    // If the remoteStream is provided, set it as the source for the video element
    if (remoteStream) {
      remoteVideoStreamElem.srcObject = remoteStream;

      // const audioTracks = remoteStream.getAudioTracks()
      const videoTracks = remoteStream.getVideoTracks();

      if (videoTracks.length === 0){
        remoteVideoStreamElem.style.display = 'none';
        noImageElem.style.display = 'block';
      } else{
        remoteVideoStreamElem.style.display = 'block';
        noImageElem.style.display = 'none';
      }
    } else{
      console.log('=========no pic========');
    }

    if (talking == true){
      console.log('=====talking is true=======');
      remoteVideoContainer.classList.add('border', 'border-danger');

    } else if (talking == false){
      console.log('=====talking is false=======');
      remoteVideoContainer.classList.remove('border', 'border-danger');
    }
  }
}

function removeVideoElementByFeed(feed, stopTracks = true) {
  const videoContainer = document.getElementById(`video_${feed}`);
  if (videoContainer) removeVideoElement(videoContainer, stopTracks);
}

function removeVideoElement(container, stopTracks = true) {
  let videoStreamElem = container.getElementsByTagName('video').length > 0 ? container.getElementsByTagName('video')[0] : null;
  if (videoStreamElem && videoStreamElem.srcObject && stopTracks) {
    videoStreamElem.srcObject.getTracks().forEach(track => track.stop());
    videoStreamElem.srcObject = null;
  }
  container.remove();
}

function removeAllVideoElements() {
  const locals = document.getElementById('locals');
  const localVideoContainers = locals.getElementsByTagName('div');
  for (let i = 0; localVideoContainers && i < localVideoContainers.length; i++)
    removeVideoElement(localVideoContainers[i]);
  while (locals.firstChild)
    locals.removeChild(locals.firstChild);

  var remotes = document.getElementById('remotes');
  const remoteVideoContainers = remotes.getElementsByTagName('div');
  for (let i = 0; remoteVideoContainers && i < remoteVideoContainers.length; i++)
    removeVideoElement(remoteVideoContainers[i]);
  while (remotes.firstChild)
    remotes.removeChild(remotes.firstChild);
  document.getElementById('videos').getElementsByTagName('span')[0].innerHTML = '   --- VIDEOROOM () ---  ';
}

function _closePC(pc) {
  if (!pc) return;
  pc.getSenders().forEach(sender => {
    if (sender.track)
      sender.track.stop();
  });
  pc.getReceivers().forEach(receiver => {
    if (receiver.track)
      receiver.track.stop();
  });
  pc.onnegotiationneeded = null;
  pc.onicecandidate = null;
  pc.oniceconnectionstatechange = null;
  pc.ontrack = null;
  pc.close();
}

function closePC(feed) {
  if (!feed) return;
  let pc = pcMap.get(feed);
  console.log('closing pc for feed', feed);
  _closePC(pc);
  pcMap.delete(feed);
}

function closeAllPCs() {
  console.log('closing all pcs');

  pcMap.forEach((pc, feed) => {
    console.log('closing pc for feed', feed);
    _closePC(pc);
  });

  pcMap.clear();
}

function getDateTime() {
  var today = new Date();
  var date = today.getFullYear() + '-' + (today.getMonth()+1) + '-' + today.getDate();
  var time = today.getHours() + ":" + today.getMinutes() + ":" + today.getSeconds()+ ":" + today.getMilliseconds();
  var date_time = date + ' ' + time;  
  return date_time;
}