/* eslint-disable no-sparse-arrays */
/* global io */

'use strict';

const RTCPeerConnection = (window.RTCPeerConnection || window.webkitRTCPeerConnection || window.mozRTCPeerConnection).bind(window);

const pcMap = new Map();
let pendingOfferMap = new Map();
var myRoom = getURLParameter('room') ? parseInt(getURLParameter('room')) : (getURLParameter('room_str') || 1234);
const randName = ('John_Doe_' + Math.floor(10000 * Math.random()));
const myName = getURLParameter('name') || randName;

const button = document.getElementById('button');
var localStream;
var frameRate;
var audioSet = true;
var videoSet = true;
var local_pc;
var local_audio_sender;
var local_video_sender;
var local_feed;
var local_display;
var local_audio_onoff = true;
var local_video_onoff = true;


connect.onclick = () => {
  if (socket.connected) {
    alert('already connected!');
  }
  else {
    socket.connect();
  }
};
disconnect.onclick = () => {
  if (!socket.connected) {
    alert('already disconnected!');
  }
  else {
    socket.disconnect();
  }
};
create_room.onclick = () => {
  if ($('#new_room_name').val() == '') alert('생성할 방이름을 입력해야 합니다.');
  else _create({ 
    room: generateRandomNumber(), 
    description: $('#new_room_name').val(), 
    max_publishers : 100, 
    audiocodec : 'opus', 
    videocodec : 'vp8', 
    talking_events : false, 
    talking_level_threshold : 25, 
    talking_packets_threshold : 100, 
    permanent : false,
    bitrate: 512000,
    secret: 'adminpwd' });
};
list_rooms.onclick = () => {
  _listRooms();
};
get_room_id.onclick = () => {
  getRoomId('Demo 1234');
};

// join2.onclick = () => {
//   alert('join');
//   join();
// };

leave_all.onclick = () => {
  let evtdata = {
    data: {feed: $('#local_feed').text()},
  }
  console.log(evtdata);
  if ($('#local_feed').text() == '') return;
  // else _leave({feed: parseInt($('#local_feed').text()), display: $('#myInput').val()});
  else _leaveAll({feed: $('#local_feed').text(), display: $('#myInput').val()});
};

unpublish.onclick = () => {
  if ($('#unpublish').text() == 'Unpublish') {
    if (local_feed) {
      _unpublish({feed : local_feed});
    }
  } else {
    publishOwnFeed();
  }
};

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

// const socket = io("http://0.0.0.0:4443/janode");
const socket = io({
  rejectUnauthorized: false,
  autoConnect: false,
  reconnection: false,
});

function destroy_room(room, desc) {
    if (confirm(desc + ' room을 삭제하겠습니까?')) {
      _destroy({ room : room, permanent : false, secret : 'adminpwd' });
    }
};
  
// function join22(room, desc) {
//   var display_name = $('#display_name').val();

//   // var display_name = $('#myInput').val();
//   // if (display_name == '') {
//   //   alert('참석할 이름을 입력해야 합니다.');
//   //   return;
//   // }
//   join({room: room, display:display_name, token:null});
//   // if (confirm('Room ['+ desc+'] 에 [' + display_name+ '] 이름으로 조인하겠습니까?')) {
//   //   join({room: room, display:display_name, token:null});
//   // }

// }
function join22(room, desc) {
  var display_name = $('#display_name').val();
  if (display_name == '') {
    alert('참석할 이름을 입력해야 합니다.');
    return;
  }
  join({room: room, display:display_name, token:null});
}

function join({ room = myRoom, display = myName, token = null }) {
  console.log("================ join =============");
  const joinData = {
    room,
    display,
    token,
  };
  console.log('join sent as below ', getDateTime());
  console.log({
    data: joinData,
    _id: getId(),
  });
  socket.emit('join', {
    data: joinData,
    _id: getId(),
  });
}

function subscribe({ feed, room = myRoom, substream, temporal }) {
  console.log("================ subscribe =============");
  const subscribeData = {
    room,
    feed,
  };

  if (typeof substream !== 'undefined') subscribeData.sc_substream_layer = substream;
  if (typeof temporal !== 'undefined') subscribeData.sc_temporal_layers = temporal;

  console.log('subscribe sent as below ', getDateTime());
  console.log({
    data: subscribeData,
    _id: getId(),
  });
  socket.emit('subscribe', {
    data: subscribeData,
    _id: getId(),
  });
}

function subscribeTo(peers, room = myRoom) {
  peers.forEach(({ feed }) => {
    // console.log({ feed, room });
    subscribe({ feed, room });
  });
}

function trickle({ feed, candidate }) {
  // const trickleData = candidate ? { candidate } : {};
  // trickleData.feed = feed;
  // const trickleEvent = candidate ? 'trickle' : 'trickle-complete';

  // console.log("================ trickle =============");
  // console.log(trickleEvent + ' sent as below ', getDateTime());
  // console.log({
  //   data: trickleData,
  //   _id: getId(),
  // });

  // socket.emit(trickleEvent, {
  //   data: trickleData,
  //   _id: getId(),
  // });
}

function configure({ feed, jsep, restart, substream, temporal, just_configure }) {
  console.log("================ configure =============");
  var v_just_configure;
  const configureData = {
    feed,
    audio: true,
    video: true,
    data: true,
  };
  if (typeof substream !== 'undefined') configureData.sc_substream_layer = substream;
  if (typeof temporal !== 'undefined') configureData.sc_temporal_layers = temporal;
  if (jsep) configureData.jsep = jsep;
  if (typeof restart === 'boolean') configureData.restart = false;
  if (typeof just_configure !== 'undefined') v_just_configure = just_configure;
  else v_just_configure = false;

  const configId = getId();

  console.log('configure sent as below ', getDateTime());
  console.log({
    data: configureData,
    _id: configId,
  });
  socket.emit('configure', {
    data: configureData,
    _id: configId,
    just_configure: v_just_configure,
  });

  if (jsep) pendingOfferMap.set(configId, { feed });
}
$(document).on("click", ".audioOn, .audioOff", function () {
  configure_bitrate_audio_video('audio');
});
$(document).on("click", ".videoOn, .videoOff", function () {
  configure_bitrate_audio_video('video');
});

async function configure_bitrate_audio_video(mode, bitrate=0) {
  console.log("================ configure_bitrate_audio_video =============");
  var feed = parseInt($('#local_feed').text());

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
    if ($('#audioBtn').hasClass('audioOn')) {
      $('#audioBtn').removeClass('audioOn').addClass('audioOff');

      console.log('오디오 끄기');
      // localStream = await navigator.mediaDevices.getUserMedia(
      //   { audio: false, 
      //     video: local_video_onoff
      //   });
      const audioTrack = localStream.getAudioTracks()[0];
      if (audioTrack) {
        // 오디오를 끄거나 켤 수 있는 상태인지 확인합니다.
        const isAudioEnabled = audioTrack.enabled;
      
        if (isAudioEnabled) {
          // 오디오를 끕니다.
          audioTrack.enabled = false;
          console.log("오디오를 끔");
        } else {
          // 오디오를 켭니다.
          audioTrack.enabled = true;
          console.log("오디오를 켬");
        }
      } else {
        console.log("오디오 트랙을 찾을 수 없습니다.");
      }  
      // var audioTrack = localStream.getAudioTracks();
      // if (audioTrack.length > 0) {
      //   localStream.removeTrack(audioTrack[0]);
      //   let localVideoContainer = document.getElementById('video_' + feed);
      //   let localVideoStreamElem = localVideoContainer.getElementsByTagName('video')[0];
      //   localVideoStreamElem.srcObject = localStream;
      // }
      // localStream.getTracks().forEach(track => {
      //   if (track.kind == 'audio') {
      //     console.log('stopping audio track', track);
      //     // track.enabled = false;
      //     track.stop();
      //     // local_video_sender.replaceTrack(track);
      //     // local_pc.removeTrack(local_audio_sender);
      //     console.log('audio track has been stopped', track);
      //   } else {
      //     console.log('nothing for video track when stopping audio track');
      //   }
      // });
      local_audio_onoff = false;
      // let localVideoContainer = document.getElementById('video_' + feed);
      // let localVideoStreamElem = localVideoContainer.getElementsByTagName('video')[0];
      // localVideoStreamElem.srcObject = localStream;

      // localStream.getTracks().forEach(track => {
      //   console.log('current track ===', track.kind);
      //   if (track.kind == 'audio') {
      //     console.log('오디오트랙 remove');
      //     console.log(track);
      //     console.log('오디오 트랙 remove 전 pcMap=',pcMap);
      //     local_pc.removeTrack(local_audio_sender);
      //     // local_audio_sender.replaceTrack(track);
      //     pcMap.delete(local_feed);
      //   }
      // });

      // pcMap.set(local_feed, local_pc);
      // console.log('오디오 트랙 remove 후 pcMap=',pcMap);

      // var vidTrack = localStream.getAudioTracks();
      // vidTrack.forEach(track => track.enabled = false);  

      try {
        // pcMap.forEach(async (pc, feed, map) => {
        //   console.log('오디오 끄기 pcMap feed=', feed, pc);
        //   var changed_offer = await pc.createOffer();
        //   await pc.setLocalDescription(changed_offer);
        //   configure({ feed: feed, jsep: changed_offer, restart: true, just_configure: true  });
        //   console.log('set local sdp OK with changed_offer for audio', feed);
            
        // });

        // var changed_offer = await pc.createOffer();
        // local_pc.setLocalDescription(changed_offer);
        // configure({ feed: local_feed, jsep: changed_offer, restart: true, just_configure: true  });
      } catch (e) {
        console.log('error while doing offer for changing', e);
        return;
      }

      // var configureData = {
      //   feed,
      //   audio: false,
      // };
      // console.log({
      //   data: configureData,
      //   _id: getId(),
      // });
      // socket.emit('configure', {
      //   data: configureData,
      //   _id: getId(),
      // });

    } else {
    // 오디오를 켜는 것이면,
    $('#audioBtn').removeClass('audioOff').addClass('audioOn');

      console.log('오디오 켜기');
      const audioTrack = localStream.getAudioTracks()[0];
      if (audioTrack) {
        // 오디오를 끄거나 켤 수 있는 상태인지 확인합니다.
        const isAudioEnabled = audioTrack.enabled;
      
        if (isAudioEnabled) {
          // 오디오를 끕니다.
          audioTrack.enabled = false;
          console.log("오디오를 끔");
        } else {
          // 오디오를 켭니다.
          audioTrack.enabled = true;
          console.log("오디오를 켬");
        }
      } else {
        console.log("오디오 트랙을 찾을 수 없습니다.");
      }            
      // frameRate = parseInt($('#frame_rate').val());
      // const localStream2 = await navigator.mediaDevices.getUserMedia(
      //   { audio: true, 
      //     video: local_video_onoff
      //   });
  
      // localStream2.getTracks().forEach(track => {
      //   console.log('local_audio_sender, ', local_audio_sender);
      //   console.log('local_video_sender, ', local_video_sender);
      //   if (track.kind == 'audio') {
      //     console.log('replacing audio track', track, local_audio_sender);
      //     // local_audio_sender.replaceTrack(track); //이게 맞아
      //     local_audio_sender = local_pc.addTrack(track, localStream2); 
      // console.log('audio track has been replaced.', track);
      //   } else {
      //     console.log('nothing for video track when turning on the audio track');
      //   }
      // });
      local_audio_onoff = true;
      // let localVideoContainer = document.getElementById('video_' + feed);
      // let localVideoStreamElem = localVideoContainer.getElementsByTagName('video')[0];
      // localVideoStreamElem.srcObject = localStream2;

      // localStream.getTracks().forEach(track => {
      //   console.log('current track ===', track.kind);
      //   if (track.kind == 'audio') {
      //     console.log('오디오트랙 add');
      //     console.log(local_audio_sender);
      //     local_audio_sender = local_pc.addTrack(track, localStream); 

      //     // local_audio_sender.replaceTrack(track);
      //     pcMap.delete(local_feed);
      //   }
      // });
      // pcMap.set(local_feed, local_pc);

      // var vidTrack = localStream.getAudioTracks();
      // vidTrack.forEach(track => track.enabled = true);  

      try {
        // pcMap.forEach(async (pc, feed, map) => {
        //   console.log('오디오 켜기 pcMap feed=', feed, pc);
        //   var changed_offer = await pc.createOffer();
        //   await pc.setLocalDescription(changed_offer); // <<- 여기에서 에러..
        //   configure({ feed: feed, jsep: changed_offer, restart: true, just_configure: true  });
        //   console.log('set local sdp OK with changed_offer for audio', feed);
            
        // });
        // var changed_offer = await pc.createOffer();
        // local_pc.setLocalDescription(changed_offer);
        // configure({ feed: local_feed, jsep: changed_offer, restart: true, just_configure: true  });

      } catch (e) {
        console.log('error while doing offer for changing', e);
        return;
      }
    
      // setLocalVideoElement(localStream, local_feed);

      // var vidTrack = localStream.getAudioTracks();
      // vidTrack.forEach(track => track.enabled = true);
      // var configureData = {
      //   feed,
      //   audio: true,
      // };
      // console.log({
      //   data: configureData,
      //   _id: getId(),
      // });
      // socket.emit('configure', {
      //   data: configureData,
      //   _id: getId(),
      // });

    }
  } else {
    //비디오를 끄는 것이면
    if ($('#videoBtn').hasClass('videoOn')) {
      $('#videoBtn').removeClass('videoOn').addClass('videoOff');
      
      console.log('비디오 끄기');
      // 미디어 스트림에서 비디오 트랙을 가져옵니다.
      const videoTrack = localStream.getVideoTracks()[0];

      // 비디오 트랙이 있는지 확인합니다.
      if (videoTrack) {
        // 비디오를 끄거나 켤 수 있는 상태인지 확인합니다.
        const isVideoEnabled = videoTrack.enabled;

        if (isVideoEnabled) {
          // 비디오를 끕니다.
          videoTrack.enabled = false;
          console.log("비디오를 끔");
        } else {
          // 비디오를 켭니다.
          videoTrack.enabled = true;
          console.log("비디오를 켬");
        }
      } else {
        console.log("비디오 트랙을 찾을 수 없습니다.");
      } 
      // $('.localVideoTag').hide();
      // $('.localBlankPerson').show();
      // var videoTrack = userStream.getVideoTracks();
      // if (videoTrack.length > 0) {
      //   localStream.removeTrack(videoTrack[0]);
      //   let localVideoContainer = document.getElementById('video_' + feed);
      //   // let localVideoStreamElem = localVideoContainer.getElementsByTagName('video')[0];
      //   // localVideoStreamElem.srcObject = null;
      //   localVideoContainer.style.display = 'none';
      // }

      // localStream = await navigator.mediaDevices.getUserMedia(
      //   { audio: local_audio_onoff, 
      //     video: false
      //   });

      // localStream.getTracks().forEach(track => {
      //   if (track.kind == 'video') {
      //     console.log('stopping video track', track);
      //     // track.enabled = false;
      //     track.stop();
      //     console.log('video track has been stopped', track);
      //     // local_video_sender.replaceTrack(track);
      //   } else {
      //     console.log('nothing for audio track when stopping the video track');
      //   }
      // });
      local_video_onoff = false;

      // var vidTrack = localStream.getVideoTracks();
      // vidTrack.forEach(track => track.enabled = false);

      try {
        // pcMap.forEach(async (pc, feed, map) => {
        //   console.log('pcMap feed=', feed);
        //   var changed_offer = await pc.createOffer();
        //   // await pc.setLocalDescription(changed_offer);
        //   configure({ feed: feed, jsep: changed_offer, restart: true, just_configure: true  });
        //   console.log('set local sdp OK with changed_offer for video', feed);
            
        // });
        // var changed_offer = await pc.createOffer();
        // local_pc.setLocalDescription(changed_offer);
        // configure({ feed: local_feed, jsep: changed_offer, restart: true, just_configure: true  });

      } catch (e) {
        console.log('error while doing offer for changing', e);
        return;
      }

      // var configureData = {
      //   feed,
      //   video: false,
      // };
      // console.log({
      //   data: configureData,
      //   _id: getId(),
      // });
      // socket.emit('configure', {
      //   data: configureData,
      //   _id: getId(),
      // });
    

    } else {
      //비디오를 켜는 것이면,
      $('#videoBtn').removeClass('videoOff').addClass('videoOn');

      console.log('비디오 켜기');
      // 미디어 스트림에서 비디오 트랙을 가져옵니다.
      const videoTrack = localStream.getVideoTracks()[0];

      // 비디오 트랙이 있는지 확인합니다.
      if (videoTrack) {
        // 비디오를 끄거나 켤 수 있는 상태인지 확인합니다.
        const isVideoEnabled = videoTrack.enabled;

        if (isVideoEnabled) {
          // 비디오를 끕니다.
          videoTrack.enabled = false;
          console.log("비디오를 끔");
        } else {
          // 비디오를 켭니다.
          videoTrack.enabled = true;
          console.log("비디오를 켬");
        }
      } else {
        console.log("비디오 트랙을 찾을 수 없습니다.");
      }
      // $('.localBlankPerson').hide();
      // $('.localVideoTag').show();

      // frameRate = parseInt($('#frame_rate').val());
      // localStream = await navigator.mediaDevices.getUserMedia(
      //   { audio: local_audio_onoff, 
      //     video: { frameRate: { ideal: frameRate, max: frameRate } } 
      //   });
      // localStream.getTracks().forEach(track => {
      //   if (track.kind == 'video') {
      //     console.log('replacing track', track.kind, track);
      //     local_video_sender.replaceTrack(track); //이게 맞아
      //   } else {
      //     console.log('nothing for audio track when turning on the video track', track.kind, track);
      //   }
      // });
      // local_video_onoff = { frameRate: { ideal: frameRate, max: frameRate } };
      // let localVideoContainer = document.getElementById('video_' + feed);
      // let localVideoStreamElem = localVideoContainer.getElementsByTagName('video')[0];
      // localVideoStreamElem.srcObject = localStream;
      // localVideoContainer.style.display = 'block';

      // var vidTrack = localStream.getVideoTracks();
      // vidTrack.forEach(track => track.enabled = true);

      try {
        // pcMap.forEach(async (pc, feed, map) => {
        //   console.log('pcMap feed=', feed);
        //   var changed_offer = await pc.createOffer();
        //   // await pc.setLocalDescription(changed_offer);
        //   configure({ feed: feed, jsep: changed_offer, restart: true, just_configure: true  });
        //   console.log('set local sdp OK with changed_offer for video', feed);
            
        // });
        // var changed_offer = await pc.createOffer();
        // local_pc.setLocalDescription(changed_offer);
        // configure({ feed: local_feed, jsep: changed_offer, restart: true, just_configure: true  });

      } catch (e) {
        console.log('error while doing offer for changing', e);
        return;
      }

      // var configureData = {
      //   feed,
      //   video: true,
      // };
      // console.log({
      //   data: configureData,
      //   _id: getId(),
      // });
      // socket.emit('configure', {
      //   data: configureData,
      //   _id: getId(),
      // });

    }
  }

}

async function publishOwnFeed() {
  try {
    const offer = await doOffer(local_feed, local_display, false);
    configure({ feed: local_feed, jsep: offer, just_configure: false });
    // subscribeTo(data.publishers, data.room);
    // var vidTrack = localStream.getVideoTracks();
    // vidTrack.forEach(track => track.enabled = true);
    // var vidTrack = localStream.getAudioTracks();
    // vidTrack.forEach(track => track.enabled = true);

    $('#unpublish').text('Unpublish');
  } catch (e) {
    console.log('error while doing offer in publishOwnFeed()', e);
  }

}

function _unpublish({ feed }) {
  console.log("================ _unpublish =============");
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
  console.log("================ _leave =============");
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
  console.log("================ _leaveAll =============");
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
  console.log("================ _listParticipants =============");
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
  console.log("================ _kick =============");
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
  console.log("================ start =============");
  const startData = {
    feed,
    jsep,
  };

  console.log('start sent as below ', getDateTime());
  console.log({
    data: startData,
    _id: getId(),
  });
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

function _create({ room, description, max_publishers = 6, audiocodec = 'opus', videocodec = 'vp8', talking_events = false, talking_level_threshold = 25, talking_packets_threshold = 100, permanent = false, bitrate = 512000 }) {
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

  socket.sendBuffer = [];
  // var display_name = $('#myInput').val();
  // join({room: 1264989511454137, display:display_name, token:null});
  handleRoomsList();
});

// 여기에서 사용할 변수 선언.
let hasRoomsListBeenHandled = false;

function handleRoomsList() {
  //scheduleConnection(0.1);
  // 이 밑의 함수가 딱 1회만 실행 하고싶다.
  socket.on('rooms-list', ({ data }) => {

    if (hasRoomsListBeenHandled) return;

    let totalParticipants = data.list[0].num_participants

    if (totalParticipants < 20) { 
      join({room: 1234, display:$('#myInput').val(), token:null})
    } else {
      alert(`You can not join!!! Already Too many participants`);
    }

    // 이벤트 핸들러가 실행되었음을 표시
    hasRoomsListBeenHandled = true;
  });
}

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
  console.log('joined to room ', getDateTime());
  console.log(data);
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
    var vidTrack = localStream.getVideoTracks();
    vidTrack.forEach(track => track.enabled = true);
    var vidTrack = localStream.getAudioTracks();
    vidTrack.forEach(track => track.enabled = true);
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
  console.log('feed configured just_configure=', data.just_configure, getDateTime());
  console.log(data);
  pendingOfferMap.delete(_id);
  const pc = pcMap.get(data.feed);
  if (pc && data.jsep) {
    try {
      await pc.setRemoteDescription(data.jsep);
      console.log('configure remote sdp OK ', data.jsep.type);
      if (data.jsep.type === 'offer' && data.just_configure == false) {
        console.log('data.jsep.type === offer 이므로 doAnswer()와 start() 실행.. just_configure=',data.just_configure)
        const answer = await doAnswer(data.feed, null, data.jsep);
        start(data.feed, answer);
      }
    } catch (e) {
      console.log('error setting remote sdp', e);
    }
  }
});

socket.on('display', ({ data }) => {
  console.log('feed changed display name ', getDateTime());
  console.log(data);
  setRemoteVideoElement(null, data.feed, data.display);
});

socket.on('started', ({ data }) => {
  console.log('subscribed feed started ', getDateTime());
  console.log(data);
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
  // var parsedData = JSON.parse(data);
  // console.log('rooms list',  parsedData);
  $('#room_list').html('');
  data.list.forEach(rooms => {
    $('#room_list').html($('#room_list').html()+"<br><span class='room' room='"+rooms.room+"'>"+rooms.description+"</span>("+rooms.num_participants+"/"+rooms.max_publishers+")&nbsp;<button class='btn btn-primary btn-xs' room='"+rooms.room+"' onclick='join22("+rooms.room+", \""+rooms.description+"\");'>join</button>&nbsp;"+"<button class='btn btn-primary btn-xs' onclick='destroy_room("+rooms.room+", \""+rooms.description+"\");'>destroy</button>");
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

////////////////////////////////////////////////////////
// custom socket messages to receive from the Server
////////////////////////////////////////////////////////
socket.on('getRoomId', ({ data }) => {
  console.log('getRoomId received ', getDateTime());
  console.log(data);
});

////////////////////////////////////////////////////////
// end
////////////////////////////////////////////////////////

async function _restartPublisher(feed) {
  const offer = await doOffer(feed, null);
  configure({ feed, jsep: offer, just_configure: false });
}

async function _restartSubscriber(feed) {
  configure({ feed, restart: true, just_configure: false });
}

async function doOffer(feed, display) {
  console.log('doOffer().. feed=', feed, 'display=', display);
  if (!pcMap.has(feed)) {
    console.log('doOffer() ==> ', feed,' feed용 pc 가 없어서 RTCPeerConnection 생성');
    const pc = new RTCPeerConnection({
      'iceServers': [{
        urls: 'stun:stun.l.google.com:19302'
      }],
    });

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
    console.log('pc 추가됨, pcMap===', pcMap);

    try {
      frameRate = parseInt($('#frame_rate').val());
      console.log('========frame_rate=', $('#frame_rate').val());
      localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: { frameRate: { ideal: frameRate, max: frameRate } } });
      localStream.getTracks().forEach(track => {
        console.log('adding track', track, track.kind);
        if (track.kind == 'audio') {
          local_audio_sender = pc.addTrack(track, localStream);
        }
        else {
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

async function doAnswer(feed, display, offer) {
  console.log('doAnswer().. feed=', feed, 'display=', display, 'offer=', offer);
  if (!pcMap.has(feed)) {
    console.log('doAnswer() ==> ', feed,' feed용 pc 가 없어서 RTCPeerConnection 생성');
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
        /* TODO set srcObject in this callback */
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
    console.log('pc 추가됨, pcMap===', pcMap);
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

function setLocalVideoElement(localStream, feed, display, room) {
  // if (room) document.getElementById('videos').getElementsByTagName('span')[0].innerHTML = '   --- VIDEOROOM (' + room + ') ---  ';
  if (!feed) return;

  console.log('setLocalVideoElement() >>>', feed);
  if (!document.getElementById('video_' + feed)) {
    const nameElem = document.createElement('div');
    nameElem.innerHTML = display;
    nameElem.style.display = 'table';
    nameElem.style.cssText = 'color: #fff; font-size: 0.8rem;';

    if (localStream) {
      const localBlankPersonElem = document.createElement('img');
      localBlankPersonElem.classList.add("localBlankPerson");

      const localVideoStreamElem = document.createElement('video');
      //localVideo.id = 'video_'+feed;
      localVideoStreamElem.width = 160;
      localVideoStreamElem.height = 120;
      localVideoStreamElem.autoplay = true;
      localVideoStreamElem.muted = 'muted';
      localVideoStreamElem.classList.add("localVideoTag");
      // localVideoStreamElem.style.cssText = '-moz-transform: scale(-1, 1); -webkit-transform: scale(-1, 1); -o-transform: scale(-1, 1); transform: scale(-1, 1); filter: FlipH;';
      localVideoStreamElem.srcObject = localStream;

      const localVideoContainer = document.createElement('div');
      localVideoContainer.id = 'video_' + feed;
      localVideoContainer.appendChild(nameElem);
      localVideoContainer.appendChild(localVideoStreamElem);
      localVideoContainer.appendChild(localBlankPersonElem);
      localVideoContainer.classList.add("video-view");
      localVideoContainer.style.cssText = 'position: relative;';

      const localAudioOnOffElem = document.createElement('img');
      localAudioOnOffElem.id = 'audioBtn';
      // localAudioOnOffElem.src = "/img/ui_btn_audioOn.png";
      localAudioOnOffElem.classList.add("audioOn");

      const localVideoOnOffElem = document.createElement('img');
      localVideoOnOffElem.id = 'videoBtn';
      // localVideoOnOffElem.src = "/img/ui_btn_videoOn.png";
      localVideoOnOffElem.classList.add("videoOn");
      localVideoContainer.appendChild(localAudioOnOffElem);
      localVideoContainer.appendChild(localVideoOnOffElem);

      // document.getElementById('locals').appendChild(localVideoContainer);
      document.getElementById('local2').appendChild(localVideoContainer);
      $('#local2_buttons').show();

    }
  }
  else {
    const localVideoContainer = document.getElementById('video_' + feed);
    if (display) {
      const nameElem = localVideoContainer.getElementsByTagName('div')[0];
      nameElem.innerHTML = display;
    }
    const localVideoStreamElem = localVideoContainer.getElementsByTagName('video')[0];
    if (localStream)
      console.log('setLocalVideoElement() >>> change local stream...');
      localVideoStreamElem.srcObject = localStream;
  }
}

// function setRemoteVideoElement(remoteStream, feed, display) {
//   if (!feed) return;

//   if (!document.getElementById('video_' + feed)) {
//     const nameElem = document.createElement('div');
//     nameElem.style.display = 'table';
//     nameElem.style.cssText = 'color: #fff; font-size: 0.8rem;';

//     const remoteVideoStreamElem = document.createElement('video');
//     if (display == 'share') {
//       console.log(display, display, display);
//       nameElem.innerHTML = '';
//       // remoteVideoStreamElem.width = 1224;  //320
//       // remoteVideoStreamElem.height = 768;  //240
//       remoteVideoStreamElem.style.cssText = 'width:95%; height: 80%; margin-top: 20px;';
//     } else {
//       nameElem.innerHTML = display;
//       remoteVideoStreamElem.width = 160;
//       remoteVideoStreamElem.height = 120;
//     }
//     remoteVideoStreamElem.autoplay = true;
//     // remoteVideoStreamElem.style.cssText = '-moz-transform: scale(-1, 1); -webkit-transform: scale(-1, 1); -o-transform: scale(-1, 1); transform: scale(-1, 1); filter: FlipH;';
//     if (remoteStream) {
//       console.log('======== remoteStream ============', feed);
//       console.log(remoteStream);
//       remoteVideoStreamElem.srcObject = remoteStream;
//     }

//     const remoteVideoContainer = document.createElement('div');
//     remoteVideoContainer.style.cssText = 'padding: 0 5px 0 5px;';
//     remoteVideoContainer.id = 'video_' + feed;
//     remoteVideoContainer.appendChild(nameElem);
//     remoteVideoContainer.appendChild(remoteVideoStreamElem);

//     if (display == 'share') {
//       document.getElementById('screen').appendChild(remoteVideoContainer);
//     } else {
//       document.getElementById('remotes').appendChild(remoteVideoContainer);
//     }
//   }
//   else {
//     const remoteVideoContainer = document.getElementById('video_' + feed);
//     if (display) {
//       const nameElem = remoteVideoContainer.getElementsByTagName('div')[0];
//       if (display == 'share') {
//         nameElem.innerHTML = '';
//       } else {
//         nameElem.innerHTML = display;
//       }
//     }
//     if (remoteStream) {
//       console.log('======== remoteStream ============', feed);
//       console.log(remoteStream);
//       const remoteVideoStreamElem = remoteVideoContainer.getElementsByTagName('video')[0];
//       remoteVideoStreamElem.srcObject = remoteStream;
//     }
//   }
// }

// 새로운 파일 추가되는 부분
document.getElementById('js-pagination').addEventListener('click', (event) => {
  if (event.target.tagName === 'BUTTON') {
    currentPage = parseInt(event.target.textContent);
    renderPage(currentPage);
  }
});

const itemsPerPage = 5;
let currentPage = 1;

function renderPage(pageNumber) {
  
  const startIndex = (pageNumber - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const remoteContainers = document.querySelectorAll('#remotesMulti > div');
  const paginationContainer = document.getElementById('js-pagination');
  paginationContainer.innerHTML = '';
  
  remoteContainers.forEach((container, index) => { 
    if (index >= startIndex && index < endIndex) {
      container.style.display = 'block';
    } else {
      container.style.display = 'none';
    }
  });

  const totalItems = remoteContainers.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage);

  // 현재 페이지가 총 페이지 수보다 클 경우, 마지막 페이지로 이동
  if (pageNumber > totalPages) {
    currentPage = totalPages > 0 ? totalPages : 1;
    return renderPage(currentPage);
  }
  let showParticipants = document.getElementById('participants');
  
  function updateParticipants() {
    showParticipants.innerHTML = `<strong>참여인원: <span class="fadeInBlack">${totalItems}</span>명</strong>`;
  }
  
  updateParticipants();
  
  console.log('pageNumber >>>', pageNumber);
  for (let i = 1; i <= totalPages; i++) {
    const pageButton = document.createElement('button');
    pageButton.textContent = i;
    pageButton.className = 'pagination-button';

    if (i === pageNumber) {
      pageButton.classList.add('clicked');
    }

    paginationContainer.appendChild(pageButton);
    pageButton.addEventListener('click', function() {
      const previouslyClickedButton = paginationContainer.querySelector('.pagination-button.clicked');
      if (previouslyClickedButton) {
        previouslyClickedButton.classList.remove('clicked');
      }
      
      this.classList.add('clicked');

      currentPage = parseInt(this.textContent);
      renderPage(currentPage);
    });
  } 
}

function setRemoteVideoElement(remoteStream, feed, display) {
  if (!feed) return;

  if (!document.getElementById('video_' + feed)) {
    const nameElem = document.createElement('span');
    // nameElem.innerHTML = display + ' (' + feed + ')';
    nameElem.innerHTML = display
    nameElem.style.display = 'table';

    const remoteVideoStreamElem = document.createElement('video');
    remoteVideoStreamElem.width = 160;
    remoteVideoStreamElem.height = 120;
    remoteVideoStreamElem.autoplay = true;
    remoteVideoStreamElem.style.cssText = '-moz-transform: scale(-1, 1); -webkit-transform: scale(-1, 1); -o-transform: scale(-1, 1); transform: scale(-1, 1); filter: FlipH;';
    if (remoteStream)
      remoteVideoStreamElem.srcObject = remoteStream;

    const remoteVideoContainer = document.createElement('div');
    remoteVideoContainer.id = 'video_' + feed;
    remoteVideoContainer.style.marginRight = '10px';
    remoteVideoContainer.classList.add('remote-container');
    remoteVideoContainer.appendChild(nameElem);
    remoteVideoContainer.appendChild(remoteVideoStreamElem);

    document.getElementById('remotesMulti').appendChild(remoteVideoContainer);

    renderPage(currentPage);

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
  else {
    const remoteVideoContainer = document.getElementById('video_' + feed);
    if (display) {
      const nameElem = remoteVideoContainer.getElementsByTagName('span')[0];
      nameElem.innerHTML = display;
      // nameElem.innerHTML = display + ' (' + feed + ')';
    }
    if (remoteStream) {
      const remoteVideoStreamElem = remoteVideoContainer.getElementsByTagName('video')[0];
      remoteVideoStreamElem.srcObject = remoteStream;
    }
  }
}

// 수정 끝

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

  var remotes = document.getElementById('remotesMulti');
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

///////////////////////////////////////////////////////////
// custom emit messages to send to the Server
///////////////////////////////////////////////////////////
function getRoomId(roomName) {
  console.log("================ getRoomId =============");
  _listRooms();
  console.log($('#room_list').find('.room').length);
  var roomList = $('#room_list').find('.room');
  console.log('roomList=', roomList);
  roomList.forEach((room) => {
    console.log('room=', room);
    var roomId = room.attr('room');
    var roomName = room.text();
    console.log('roomId=',roomId, '    roomName=',roomName);

  });
  
}

////////////////////////////////////////////////////////
// end
////////////////////////////////////////////////////////
