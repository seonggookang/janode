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
let roomIWant;

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
    talking_events : true, 
    talking_level_threshold : 25, 
    talking_packets_threshold : 100, 
    permanent : true, // false -> true로 바꾸니 서버에 아예 영구히 들어감 - by steve
    bitrate: 128000,
    secret: 'adminpwd'
  });
};

function _create({ room, description, max_publishers = 6, audiocodec = 'opus', videocodec = 'vp8', talking_events = true, talking_level_threshold = 25, talking_packets_threshold = 100, permanent = false, bitrate = 128000 }) {
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

list_rooms.onclick = () => {
  _listRooms();
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
  else _leaveAll({feed: $('#local_feed').text()});
};

unpublish.onclick = () => {
  if ($('#unpublish').text() == 'Unpublish') {
    console.log('local_feed >>> ', local_feed);
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
  console.log('room==='+room); // 이것만 계속 나오네
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

// const socket = io('https://192.168.50.156:4443/'); // 
// const socket = io('https://192.168.50.19:4443/'); // 
// const socket = io('https://192.168.50.116:4443/'); // 
// const socket = io('https://192.168.56.1:4443/'); // 
// const socket = io("https://localhost:4443"); // 내 주소
const socket = io({
  rejectUnauthorized: false,
  autoConnect: false,
  reconnection: false,
});

function destroy_room(room, desc) {
    if (confirm(desc + ' room을 삭제하겠습니까?')) {
      _destroy({ room : room, permanent : true, secret : 'adminpwd' }); // permanent를 true로 설정해서 영구히 삭제 - by Steve
    }
};

function join22(room, desc, totalParticipants) {
  var display_name = $('#display_name').val();
  if (display_name == '') {
    alert('참석할 이름을 입력해야 합니다.');
    return;
  }
  if (totalParticipants < 20) { // 로컬 포함 5명이면 더 이상 못들어옴
    join({room: room, display:display_name, token:null});
  } else {
    alert('you can not join!!! Too many participants');
  }
}

function join({ room = myRoom, display = myName, token = null }) {
  const joinData = {
    room,
    display,
    token,
  };

  socket.emit('join', {
    data: joinData, // 이 data에서 display가 이미 해당 방에 포함되어 있다면 막아라 로직 너헝야함.
    _id: getId(),
  });
}

// 현재 화면에 노출된 peers --> 비디오 : O, 오디오 : O
// 다른 페이지에 있는 peers --> 비디오 : X, 오디오 : O
function subscribe({ feed, room = myRoom, offer_video, substream, temporal }) {
  // switch에서 (from_feed, to_feed) <<-- 각각에 대해 배열에 담아 처리할 수 있다면?
  const subscribeData = {
    room,
    feed,
    offer_video,
  };
  console.log('subscribeData >>>>> ', subscribeData);
  if (typeof substream !== 'undefined') subscribeData.sc_substream_layer = substream;
  if (typeof temporal !== 'undefined') subscribeData.sc_temporal_layers = temporal;

  socket.emit('subscribe', {
    data: subscribeData,
    _id: getId(),
  });
}

// 내가 원하는 값 itemsPerPage에 따라 subscribe의 갯수를 정해야 함
// function subscribeTo(peers, room = myRoom) {
//   // peers.forEach(({ feed }) => { // 이 peers의 갯수를 조절해야겠네. 2개까지는 offer_video를 true, 나머지는 false
//   //   subscribe({ feed, room }); // 이 3번째 인자로 뭔가 처리를 해줘야함
//   // });
//   const deepPeers = {...peers};
//   allPeople.push(deepPeers);
//   console.log('peers in subscribeTo >>> ', peers);
//   console.log('allPeople.slice(1) in subscribeTo >>> ', allPeople.slice(1));


  
//   // peers가 빈 값으로 나오는 중이네..???
//   peers.forEach(({ feed }, index) => {
//     console.log('index in peers >>> ', index);
//     let isShow = index < itemsPerPage; // 배열의 인덱스가 2 미만이면 true, 아니면 false
//     subscribe({ feed, room, offer_video:isShow }); // 수정된 부분: varvar를 인자로 추가
//     // 이 떄마다 renderPage를 또 해주면 될 듯?
//     renderPage(1);
//   });
// }

function subscribeTo(peer, room = myRoom) {
  console.log('peer in subscribeTo >>>> ', peer) // 1명건데 배열의 형태.
  console.log('pendingOfferMap in subscribeTo >>> ', pendingOfferMap);
  roomIWant = room;  
  allPeople.push(...peer); // syntax error 
  // const deepPeers = [...peers];
  // console.log('deepPeers >>>> ', deepPeers) 
  // allPeople.push(deepPeers);
  // console.log('allPeople >>>> ', allPeople) 
  // const extractedRemote = allPeople.slice(1)[0] // remote Peers 정보들
  // console.log('extractedRemote[0] >>>> ', extractedRemote[0]) 
  // renderPage();
  
  peer.forEach(({ feed }) => { // 이 peers의 갯수를 조절해야겠네. 2개까지는 offer_video를 true, 나머지는 false
    subscribe({ feed, room}); // 이 3번째 인자로 뭔가 처리를 해줘야함
  });
}

function subscribeTo2(index, feed, room, offer_video) {
  console.log('index 222 >>> ', index);
  console.log('peer 222 >>> ', feed);
  console.log('room 222 >>> ', room);
  console.log('offer_video 222 >>> ', offer_video);
  
  // roomIWant = room;  
  // allPeople.push(...peer); // syntax error 
  // const deepPeers = [...peers];
  // console.log('deepPeers >>>> ', deepPeers) 
  // allPeople.push(deepPeers);
  // console.log('allPeople >>>> ', allPeople) 
  // const extractedRemote = allPeople.slice(1)[0] // remote Peers 정보들
  // console.log('extractedRemote[0] >>>> ', extractedRemote[0]) 
  // renderPage();
  console.log('offerCopy22222 >>> ', offerCopy); // joined에서 받은 offer랑 동일 !!!
  console.log('index 의 feed, offer_video >>> ', index.feed, index.offer_video);
  subscribe({ feed, room, offer_video }); // 이 3번째 인자로 뭔가 처리를 해줘야함
  // peer.forEach(({ feed }) => { // 이 peers의 갯수를 조절해야겠네. 2개까지는 offer_video를 true, 나머지는 false
  //   console.log('안녕 나 또왔쪙')
  //   subscribe({ feed, room, offer_video : true }); // 이 3번째 인자로 뭔가 처리를 해줘야함
  // });
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

function configure({ feed, jsep, restart, substream, temporal }) {

  const configureData = {
    feed,
    audio: true,
    video: true,
    data: true,
  };
  if (typeof substream !== 'undefined') configureData.sc_substream_layer = substream;
  if (typeof temporal !== 'undefined') configureData.sc_temporal_layers = temporal;
  if (jsep) configureData.jsep = jsep; // jsep 이게 없어도 동작이 되게.
  if (typeof restart === 'boolean') configureData.restart = restart;

  const configId = getId();

  socket.emit('configure', {
    data: configureData,
    _id: configId,
  });

  if (jsep) pendingOfferMap.set(configId, { feed });
}

function configure_bitrate_audio_video(mode) {
  var feed = $('#local_feed').text();

  if (mode == 'bitrate') {
    var configureData = {
      feed,
      bitrate: '12800',
    };
    // var bitrate_label = ((bitrate / 1000) > 1000) ? (bitrate / 1000 / 1000) + 'M' : (bitrate / 1000) + 'K';
    // $('#Bandwidth_label').text(bitrate_label);
    socket.emit('configure', {
      data: configureData,
      _id: getId(),
    });
  
   
  } else if (mode =='audio') {
    if ($('#audioset').hasClass('btn-primary')) {
      $('#audioset').removeClass('btn-primary').addClass('btn-warning');
      console.log('오디오 켜기');
      var audioset = false;
      var vidTrack = localStream.getAudioTracks();
      vidTrack.forEach(track => track.enabled = false);      
    } else {
      $('#audioset').removeClass('btn-warning').addClass('btn-primary');
      console.log('오디오 끄기');
      var audioset = true;
      var vidTrack = localStream.getAudioTracks();
      vidTrack.forEach(track => track.enabled = true);      
    }
  } else {
    // 비디오를 끄는 것이면
    if ($('#videoset').hasClass('btn-primary')) {
      $('#videoset').removeClass('btn-primary').addClass('btn-warning');

      console.log('비디오 끄기');
      // var videoset = false;
      var vidTrack = localStream.getVideoTracks();
      vidTrack.forEach(track => track.enabled = false);      

    } else {
      $('#videoset').removeClass('btn-warning').addClass('btn-primary');
      
      console.log('비디오 켜기');
      // var videoset = true;
      var vidTrack = localStream.getVideoTracks();
      vidTrack.forEach(track => track.enabled = true);      

      
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
  const unpublishData = {
    feed,
  };

  socket.emit('unpublish', {
    data: unpublishData,
    _id: getId(),
  });
}

function _leave({ feed }) {
  const leaveData = {
    feed,
  };

  socket.emit('leave', {
    data: leaveData,
    _id: getId(),
  });
}
function _leaveAll({ feed }) {
  const leaveData = {
    feed,
  };

  console.log('leaveData', leaveData);
  socket.emit('leaveAll', {
    data: leaveData,
    _id: getId(),
  });
}

function _listParticipants({ room = myRoom } = {}) {
  const listData = {
    room,
  };

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

  socket.emit('start', {
    data: startData,
    _id: getId(),
  });
}

function _pause({ feed }) {
  const pauseData = {
    feed,
  };

  socket.emit('start', {
    data: pauseData,
    _id: getId(),
  });
}


function _switch({ from_feed, to_feed, audio = true, video = true, data = false }) {
  const switchData = {
    from_feed,
    to_feed,
    audio,
    video,
    data,
  };

  socket.emit('switch', {
    data: switchData,
    _id: getId(),
  });
}

function _exists({ room = myRoom } = {}) {
  const existsData = {
    room,
  };

  socket.emit('exists', {
    data: existsData,
    _id: getId(),
  });
}

function _listRooms(desc) {
  socket.emit('list-rooms', { // socket.on('rooms-list' 이거랑 매칭 되네 ???
    _id: getId(),
    desc,
  });
}

// update 함수 생성 (plugin에서 있지만 사용 안하고 있었음)
function _update(container, action) {
  console.log('update를 시도합니다~~~~~~~~~~~~~~~~');
  const feedId = container.getAttribute('data-feed-id');
  const mid = container.getAttribute('data-mid');
  console.log('subscribe >>>>> ', subscribe);
  console.log('unsubscribe >>>>> ', unsubscribe);

  const subscribeData = {
    feed: feedId,
    mid: mid
  };

  const unsubscribeData = {
    feed: feedId,
    mid: mid,
    sub_mid: mid
  };

  const data = action === 'subscribe' ? subscribeData : unsubscribeData;

  socket.emit('update', {
    data: {
      subscribe: action === 'subscribe' ? [data] : [],
      unsubscribe: action === 'unsubscribe' ? [data] : [],
    },
    _id: getId(),
  });
}



function _destroy({ room = myRoom, permanent = false, secret = 'adminpwd' }) {
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
  const allowData = {
    room,
    action,
    secret,
  };
  if (action != 'disable' && token) allowData.list = [token];

  socket.emit('allow', {
    data: allowData,
    _id: getId(),
  });
}

function _startForward({ feed, room = myRoom, host = 'localhost', audio_port, video_port, data_port = null, secret = 'adminpwd' }) {
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
  // var display_name = $('#display_name').val();
  // join({room: 1264989511454137, display:display_name, token:null});
  
  //scheduleConnection(0.1);
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

socket.on('leaveAll', () => {
  console.log('leaved all rooms');
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
  alert(error);
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

let allPeople = [];
let offerCopy;
// data.publishers가 인식이 되면 됨
// 'join'추적해서 data에 왜!!!!! publishers 안찍히는지 확인
socket.on('joined', async ({ data }) => {
  $('#local_feed').text(data.feed);
  $('#private_id').text(data.private_id);
  $('#curr_room_name').val(data.description);
  $('#leave_all').prop('disabled', false);
  _listRooms(); 
  setLocalVideoElement(null, null, null, data.room, data.description); // description 추가함. 스크린 위에 표시하기 위해.
  
  // renderPage(1);
  // 방에 이미 있던 유저들 --> data.publishers
  console.log('data.publishers >>> ', data.publishers);
  
  try {
    const offer = await doOffer(data.feed, data.display, false); // 에러발생
    offerCopy = offer;
    configure({ feed: data.feed, jsep: offer });
    subscribeTo(data.publishers, data.room); // 카메라가 없는거에 대해 data.publishers가 아예 인식이 안되는 상태
    // localStream이 없으니까 에러가 나는 중
    // var vidTrack = localStream.getVideoTracks();
    // vidTrack.forEach(track => track.enabled = true); // 이게 false로 돼있어서 join시, 항상 꺼진 화면으로 시작됐음.
    // var vidTrack = localStream.getAudioTracks();
    // vidTrack.forEach(track => track.enabled = true);
  } catch (e) {
    console.log('조인할 때 에러!! error while doing offer >>> ', e);
  }
});

socket.on('subscribed', async ({ data }) => {
  console.log('subscribed to feed >>> ', data);

  try {
    const answer = await doAnswer(data.feed, data.display, data.jsep);
    start({ feed: data.feed, jsep: answer }); // 이건 사실 상 콘솔만 찍는거 아닌강?
    _listRooms();
  } catch (e) { console.log('error while doing answer', e); }
});

socket.on('participants-list', ({ data }) => {
  console.log('participants list', data);
});

socket.on('talking', ({ data }) => {
  console.log('talking notify >>> ', data);

  const localVideoContainer = document.getElementById('video_' + data.feed);

  if (data.talking) {
    localVideoContainer.style.border = '3px solid red';
  } else {
    localVideoContainer.style.border = '';
  }
});

socket.on('kicked', ({ data }) => {
  console.log('participant kicked', data);
  if (data.feed) {
    removeVideoElementByFeed(data.feed);
    closePC(data.feed);
  }
});

socket.on('allowed', ({ data }) => {
  console.log('token management', data);
});
let answerCopy;
socket.on('configured', async ({ data, _id }) => {
  console.log('data in configured >>> ', data); // feed,jsep, room
  // 카메라가 있는 쪽 --> { type, sdp }
  // 카메라가 없는 쪽 --> undefined
  pendingOfferMap.delete(_id);
  const pc = pcMap.get(data.feed);

  // 카메라가 있을 때
  if (pc && data.jsep) {
    try {
      await pc.setRemoteDescription(data.jsep);
      console.log('configure remote sdp OK');
      if (data.jsep.type === 'offer') {
        const answer = await doAnswer(data.feed, null, data.jsep);
        answerCopy = answer;
        start(data.feed, answer);
      }
    } catch (e) {
      console.log('error setting remote sdp', e);
    }
  } else {
    console.log('카메라 없으면 보이는 코드')
  }
  
  // if (pc) {
  //   if (data.jsep) {
  //     try {
  //       await pc.setRemoteDescription(data.jsep); // 이걸 안하고 있어서 안되고 있었음.
  //       console.log('카메라가 있으면 보이는 코드');
  //       console.log('configure remote sdp OK !!!');
  //       if (data.jsep.type === 'offer') {
  //         const answer = await doAnswer(data.feed, null, data.jsep);
  //         start(data.feed, answer); // 단순 콘솔 찍는 코드
  //       }
  //     } catch (e) {
  //       console.log('error setting remote sdp >>> ', e);
  //     }
  //   } else {

  //     // 카메라가 없는 경우에도 처리할 로직
  //     console.log('카메라 없으면 보이는 코드');
  //     // 필요한 경우 여기에 카메라가 없을 때 수행할 추가적인 작업을 추가
  //     // await pc.setRemoteDescription(null); // 이걸 안해도 되네.
  //     // setRemoteVideoElement(null, data.feed, null);
  //     // const answer = await doAnswer(data.feed, null, null);
  //     // start(data.feed, answer); // 단순 콘솔 찍는 코드
  //   }
  // } 
});

socket.on('display', ({ data }) => {
  console.log('feed changed display name', data);
  setRemoteVideoElement(null, data.feed, data.display);
});

socket.on('started', ({ data }) => {
  console.log('subscribed feed started', data);
});

socket.on('paused', ({ data }) => {
  console.log('feed paused', data);
});


socket.on('switched', ({ data }) => {
  console.log(`feed switched from ${data.from_feed} to ${data.to_feed} (${data.display})`);
  /* !!! This will actually break the DOM management since IDs are feed based !!! */
  setRemoteVideoElement(null, data.from_feed, data.display);
});

socket.on('feed-list', ({ data }) => {
  console.log('new feeds available!', data);
  subscribeTo(data.publishers, data.room);
});

socket.on('unpublished', ({ data }) => {
  console.log('feed unpublished', data);
  if (data.feed) {
    removeVideoElementByFeed(data.feed);
    closePC(data.feed);
  }
});

socket.on('leaving', ({ data }) => {
  console.log('feed leaving', data);
  _listRooms();
  if (data.feed) {
    removeVideoElementByFeed(data.feed);
    closePC(data.feed);
    renderPage(currentPage);
  }
});

socket.on('exists', ({ data }) => {
  console.log('room exists', data);
});

socket.on('rooms-list', ({ data }) => {
  // console.log('data >>>>>> ', data); // janus.plugin.videoroom.jcfg 코드 에서 옴.
  // var parsedData = JSON.parse(data);
  console.log('data >>> ', JSON.parse(data));
  $('#room_list').html('');
  JSON.parse(data).forEach(rooms => { // data.list.forEach는 내꺼 돌아가고, parsedData.forEach는 peter꺼.
    // $('#room_list').html($('#room_list').html()+"<br>"+rooms.description +" ("+rooms.num_participants+" / "+rooms.max_publishers+")&nbsp;<button class='btn btn-primary btn-xs' onclick='join22("+rooms.room+", \""+rooms.description+"\");'>join</button>&nbsp;"+"<button class='btn btn-primary btn-xs' onclick='destroy_room("+rooms.room+", \""+rooms.description+"\");'>destroy</button>");
    $('#room_list').html($('#room_list').html()+"<br>"+rooms.description +" ("+rooms.num_participants+" / "+rooms.max_publishers+")&nbsp;<button class='btn btn-primary btn-xs' onclick='join22("+rooms.room+", \""+rooms.description + "\", "+rooms.num_participants+");'>join</button>&nbsp;"+"<button class='btn btn-primary btn-xs' onclick='destroy_room("+rooms.room+", \""+rooms.description+"\");'>destroy</button>");
  });
});

socket.on('created', ({ data }) => {
  console.log('room created', data);
  $('#new_room_name').val('');
  _listRooms();
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
  configure({ feed, jsep: offer });
}

async function _restartSubscriber(feed) {
  configure({ feed, restart: true });
}

async function doOffer(feed, display) {
  if (!pcMap.has(feed)) {
    const pc = new RTCPeerConnection({
      'iceServers': [{
        urls: 'stun:stun.l.google.com:19302'
      }],
    });
    pc.onnegotiationneeded = event => console.log('pc.onnegotiationneeded >>> ', event);
    pc.onicecandidate = event => {
      trickle({ feed, candidate: event.candidate })
    };
    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'closed') {
        removeVideoElementByFeed(feed);
        closePC(feed);
      }
    };
    /* This one below should not be fired, cause the PC is used just to send */
    pc.ontrack = event => console.log('pc.ontrack in doOffer >>> ', event);

    pcMap.set(feed, pc);

    try {
      localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      // 1페이지를 가리키고 있다면
      // 1페이지에 있는 사람들(2명) : video : o, audio o
      // 2페이지에 있는 사람들(2명) : video : x, audio o

      // 2페이지를 가리키고 있다면
      // 1페이지에 있는 사람들(2명) : video : x, audio o
      // 2페이지에 있는 사람들(2명) : video : o, audio o

    } catch (e) {
      console.log('카메라 자체가 없는 상황')
      // 예제: AudioContext를 사용하여 가상의 오디오 트랙 생성
      let audioContext = new AudioContext();
      console.log('audioContext >>> ', audioContext);
      let oscillator = audioContext.createOscillator();
      console.log('oscillator >>> ', oscillator);
      let dst = audioContext.createMediaStreamDestination();
      console.log('dst >>> ', dst);
      oscillator.connect(dst);
      oscillator.start();

      // 가상의 오디오 트랙을 MediaStream에 추가
      let virtualAudioTrack = dst.stream.getTracks()[0];
      localStream = new MediaStream([virtualAudioTrack]);
      // localStream = new MediaStream(); // 빈 미디어 스트림 생성. 카메라 자체가 없어도 localStream있어야함
      // localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });

      // audio와 video에 대한 정보가 나의 위치를 알려주는 결정적인 요소?,
      

      // removeVideoElementByFeed(feed);
      // closePC(feed);
      // return;
    }
    console.log('localStream.getTracks() >>> ', localStream.getTracks());
    localStream.getTracks().forEach(track => {
      console.log('adding track >>> ', track);
      pc.addTrack(track, localStream); // 이걸 해줘야 할 듯, 카마레가 있든 없든.
    });
    setLocalVideoElement(localStream, feed, display);
  }
  else {
    console.log('Performing ICE restart');
    pcMap.get(feed).restartIce();
  }

  try {
    const pc = pcMap.get(feed);
    const offer = await pc.createOffer();
    console.log('offer in try of doOffer (이게 있어야 서로 연결을 할 듯~! ) >>> ', offer);
    await pc.setLocalDescription(offer); // 카메라가 없는 쪽에서 이게 필요함
    console.log('set local sdp OK in doOffer');
    return offer;
  } catch (e) {
    console.log('error while doing offer', e);
    removeVideoElementByFeed(feed);
    closePC(feed);
    return;
  }
}

async function doAnswer(feed, display, offer) {
  if (!pcMap.has(feed)) {
    const pc = new RTCPeerConnection({
      'iceServers': [{
        urls: 'stun:stun.l.google.com:19302'
      }],
    });

    pc.onnegotiationneeded = event => console.log('pc.onnegotiationneeded', event);
    pc.onicecandidate = event => trickle({ feed, candidate: event.candidate });
    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'closed') {
        removeVideoElementByFeed(feed);
        closePC(feed);
      }
    };
    pc.ontrack = event => {
      console.log('pc.ontrack in doAnswer >>> ', event);

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
      console.log('remoteStream in doAnswer >>> ', remoteStream);
      // 몇 번째 유저인지 체크를 renderPage에서도 하고 여기서도 하고????
      setRemoteVideoElement(remoteStream, feed, display); // 이거로 인해 시작됨
      
    };

    pcMap.set(feed, pc);
  }

  const pc = pcMap.get(feed);

  try {
    console.log('offer in try of doAnswer >>> ', offer)
    await pc.setRemoteDescription(offer);
    console.log('set remote sdp OK');
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    console.log('set local sdp OK');
    return answer;
  } catch (e) {
    console.log('error creating subscriber answer', e);
    removeVideoElementByFeed(feed);
    closePC(feed);
    throw e;
  }
}

function setLocalVideoElement(localStream, feed, display, room, description) {
  if (room) document.getElementById('videos').getElementsByTagName('span')[0].innerHTML = '   --- VIDEOROOM (' + room + ' , ' + description +') ---  '; // 로컬 --- LOCALS --- 에서 치환
  if (!feed) return;
  if (!document.getElementById('video_' + feed)) {
    const nameElem = document.createElement('span');
    nameElem.innerHTML = display + '(' + feed + ')'; // 스크린 위 표시
    nameElem.style.display = 'table';
    
    let FinalElem;
    if (localStream.getTracks().length === 2) { // 본인 카메라가 있을 때
      const localVideoStreamElem = document.createElement('video');
      //localVideo.id = 'video_'+feed;
      localVideoStreamElem.width = 320;
      localVideoStreamElem.height = 240;
      localVideoStreamElem.autoplay = true;
      localVideoStreamElem.muted = 'muted';
      localVideoStreamElem.style.cssText = '-moz-transform: scale(-1, 1); -webkit-transform: scale(-1, 1); -o-transform: scale(-1, 1); transform: scale(-1, 1); filter: FlipH;';
      localVideoStreamElem.srcObject = localStream;
      FinalElem = localVideoStreamElem;
    } else { // 본인 카메라 없을 떄
      const blackScreenElem = document.createElement('div');
      blackScreenElem.style.width = '320px';
      blackScreenElem.style.height = '240px';
      blackScreenElem.style.backgroundColor = 'black';
      blackScreenElem.classList.add('black-screen');

      const textElem = document.createElement('div');
      textElem.innerText = 'No Camera';
      blackScreenElem.appendChild(textElem);
      FinalElem = blackScreenElem;
    }

    const localVideoContainer = document.createElement('div');
    localVideoContainer.id = 'video_' + feed;
    localVideoContainer.appendChild(nameElem);
    localVideoContainer.appendChild(FinalElem);

    document.getElementById('locals').appendChild(localVideoContainer);
   
  } else {
    const localVideoContainer = document.getElementById('video_' + feed);
    if (display) {
      const nameElem = localVideoContainer.getElementsByTagName('span')[0]; // 이게 뭐지??
      nameElem.innerHTML = display + ' (' + feed + ')';
    }
    const localVideoStreamElem = localVideoContainer.getElementsByTagName('video')[0];
    if (localStream)
      localVideoStreamElem.srcObject = localStream;
  }
}

const itemsPerPage = 3;
let currentPage = 1;

// 페이지 네이션 버튼 클릭
document.getElementById('js-pagination').addEventListener('click', (event) => {
  pendingOfferMap.clear();
  if (event.target.tagName === 'BUTTON') {
    currentPage = parseInt(event.target.textContent);
    renderPage(currentPage);
  }
});

function renderPage(pageNumber) {
  pendingOfferMap.clear(); // 이거든 pendingOfferMap delete든 사용. 내가 보고 있는 페이지 아닌것들에 대해서,
  const startIndex = (pageNumber - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const remoteContainers = document.querySelectorAll('#remotes > div');
  const paginationContainer = document.getElementById('js-pagination');
  paginationContainer.innerHTML = '';
  
  console.log('allPeople in renderPage >>>>> ', allPeople)
  

  // remoteContainers가 비어 있는 경우 함수 종료
  if (remoteContainers.length === 0) {
    return;
  }

  console.log('offerCopy in renderPage >>> ', offerCopy); // joined에서 받은 offer랑 동일
  console.log('answerCopy >>> ', answerCopy)
  
  // 참여한 remote 사람들의 정보와 인덱스를 이용해서, 아래의 로직을 만드는 중
  // 내가 보고 있는 페이지의 사람이라면 offer_video = true,
  // 다른 페이지의 사람이라면 offer_video = false,
  // 근데 extractedRemotePeer 이게 안 잡힘
  allPeople.forEach((person, index) => {
    const isCurrentPageItem = index >= startIndex && index < endIndex;
    const shouldOfferVideo = isCurrentPageItem && (index - startIndex) < 2;
    pendingOfferMap.clear(); 
    
    console.log("--------------------------------------------------------")
    console.log('isCurrentPageItem >>> ', index, isCurrentPageItem); // 0, 1에서만 true, 나머지 false
    console.log('shouldOfferVideo >>> ', index, shouldOfferVideo);
    console.log('person >>> ', person); // 상대방이 나옴
    console.log("--------------------------------------------------------")
     // 현재 페이지 항목에 대해서는 offer_video: true로, 나머지: false로 설정

    // "did we offer" 라는 에러가 뜬다. 그래서 doOffer를 해줘야 한다.
    // 여기에 await을 해줘야 기다렸다가 offer가 받아지고 나서 configure에 넣어주지. 비동기 처리니까!
    // 그럼 위에다가 async를 해야함
    // "did we offer ? " error 
    console.log('offerCopy in allPeople >>> ', offerCopy); // joined에서 받은 offer랑 동일 !!!
    // configure({ feed: person.feed, jsep: offerCopy }); // 되는 듯?
     // 이 위의것을 기존 'joined'에서 하던걸 여기서도 해봤더니 ICE locally error 떴다!
     // 즉, socket.on 안에서만 가능하다는 뜻 같은데...
    // await pc.setRemoteDescription(data.jsep);
    
    // console.log('configure remote sdp OK');
    // if (data.jsep.type === 'offer') {
      // const answer = await doAnswer(data.feed, null, data.jsep);
      // start(data.feed, answer);
    // }

    // subscribe({ feed: person.feed, roomIWant, offer_video: shouldOfferVideo });
    // 아 여기서 배열을 벗겨버렸구나
    // subscribeTo2( index, person.feed, roomIWant, shouldOfferVideo ); // 각 
  })
  
  // currentPageItems.forEach(({ feed }, items) => { 
  //   let show = items < 2; // 배열의 인덱스가 2 미만이면 true, 아니면 false
  //   subscribe({ feed, room, offer_video:show }); // 수정된 부분: varvar를 인자로 추가
  // });

  remoteContainers.forEach((container, index) => {
    container.style.display = index >= startIndex && index < endIndex ? 'block' : 'none';
  });
  
  
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
    pageButton.addEventListener('click', function() {
      const previouslyClickedButton = paginationContainer.querySelector('.pagination-button.clicked');
      if (previouslyClickedButton) {
        previouslyClickedButton.classList.remove('clicked');
      }

      currentPage = parseInt(this.textContent);
      renderPage(currentPage);
    });
  } 
}

function setRemoteVideoElement(remoteStream, feed, display) {
  console.log('setRemoteVideoElement 시작! >>> ', remoteStream) // 아예 카메라 없는게 동작도 안되는구나
  console.log('remoteStream.getTracks() >>> ', remoteStream.getTracks()) // 아예 카메라 없는게 동작도 안되는구나
  if (!feed) return;

  if (!document.getElementById('video_' + feed)) {
    const nameElem = document.createElement('span');
    nameElem.innerHTML = display + ' (' + feed + ')';
    nameElem.style.display = 'table';

    let FinalElem;
    // if (remoteStream.getTracks().length === 2) { // 상대 카메라 있을 때
    if (remoteStream) {
      const remoteVideoStreamElem = document.createElement('video');
      remoteVideoStreamElem.width = 320;
      remoteVideoStreamElem.height = 240;
      remoteVideoStreamElem.autoplay = true;
      remoteVideoStreamElem.style.cssText = '-moz-transform: scale(-1, 1); -webkit-transform: scale(-1, 1); -o-transform: scale(-1, 1); transform: scale(-1, 1); filter: FlipH;';
      remoteVideoStreamElem.srcObject = remoteStream;
      FinalElem = remoteVideoStreamElem;
    } 
    // 여기서 만약 remoteStream의 offer_video를 체크할 수 있다면?
    // 그게 true면 원래 스크린 보여주고,
    // 아니면 검정색 화면 보여주고

    // if (remoteStream.getTracks().length === 2) { // 상대 카메라 있을 때
    //   const remoteVideoStreamElem = document.createElement('video');
    //   remoteVideoStreamElem.width = 320;
    //   remoteVideoStreamElem.height = 240;
    //   remoteVideoStreamElem.autoplay = true;
    //   remoteVideoStreamElem.style.cssText = '-moz-transform: scale(-1, 1); -webkit-transform: scale(-1, 1); -o-transform: scale(-1, 1); transform: scale(-1, 1); filter: FlipH;';
    //   remoteVideoStreamElem.srcObject = remoteStream;
    //   FinalElem = remoteVideoStreamElem;
    // } else {  // 상대 카메라 없을 때
    //   const blackScreenElem = document.createElement('div');
    //   blackScreenElem.style.width = '320px';
    //   blackScreenElem.style.height = '240px';
    //   blackScreenElem.style.backgroundColor = 'black';
    //   blackScreenElem.classList.add('black-screen');
      
    //   const textElem = document.createElement('div');
    //   textElem.innerText = 'No Camera';
    //   blackScreenElem.appendChild(textElem);
    //   FinalElem = blackScreenElem;   
    // }

    const remoteVideoContainer = document.createElement('div');
    remoteVideoContainer.id = 'video_' + feed;
    remoteVideoContainer.classList.add('remote-container');
    remoteVideoContainer.appendChild(nameElem);
    remoteVideoContainer.appendChild(FinalElem);
    document.getElementById('remotes').appendChild(remoteVideoContainer);

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
      nameElem.innerHTML = display + ' (' + feed + ')';
    }
    if (remoteStream) {
      const remoteVideoStreamElem = remoteVideoContainer.getElementsByTagName('video')[0];
      remoteVideoStreamElem.srcObject = remoteStream;
    }
  }
}

function removeVideoElementByFeed(feed, stopTracks = true) {
  const videoContainer = document.getElementById(`video_${feed}`);
  if (videoContainer) removeVideoElement(videoContainer, stopTracks);
}

function removeVideoElement(container, stopTracks = true) {
  // let videoStreamElem = container.getElementsByTagName('video').length > 0 ? container.getElementsByTagName('video')[0] : null;
  let videoStreamElem = container.getElementsByTagName('video') && container.getElementsByTagName('video')[0];
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
