import * as THREE from '/three.module.js'
import Physijs from '/lib/physi.js'
import PointerLockControls from '/controls.js'
import {OrbitControls} from 'https://threejs.org/examples/jsm/controls/OrbitControls.js';

Physijs.scripts.ammo = '/lib/ammo.js';
Physijs.scripts.worker = '/lib/physiworker.js';

const socket = io();

let camera, 
scene,
renderer,
controls,
objects = [],
objID = [],
fps = 0,
serverFPS,
lastPing = 0,
ping = 0,
serverFrame = 0,
serverRelativeFPS = 0,
lastServFrame = 0,
pointerLocked = false,
clientObj,
background,
orbitControls,
previousPos,
playerName,
localSimFrame = 0,
localPhysFPS,
canMove = false,
sceneHasLoaded = false,
vehiclePrompt,
inVehicle = false,
overlay = document.querySelector('#overlay'),
overlayStat = document.querySelector('#overlayStat'),
chatboxInput = document.querySelector('#chatbox_input'),
chatbox = document.querySelector('#chatbox_inner'),
stat1 = document.querySelector('#fps1'),
stat2 = document.querySelector('#fps2'),
stat3 = document.querySelector('#fps3'),
statC = document.querySelector('#stat'),
vehc = document.querySelector('#vehcinf'),
rpmNeedle = document.querySelector('#rpmn'),
speedNeedle = document.querySelector('#speedn'),
gearLbl = document.querySelector('#gear'),
speedLbl = document.querySelector('#speedo');

let keys = new Set();
let socketId = Math.random();

let chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const checkChars = (str) => {
  for(let char of str) {
    if(!chars.includes(char)) return false;
  }
  return true;
}

const updateVehicle = (d) => {
  rpmNeedle.style.transform = 'rotate('+(d.rpm/7000)*180+'deg)';
  speedNeedle.style.transform = 'rotate('+(d.speed / 120)*180+'deg)';
  gearLbl.innerText = 'D'+d.gear;
  gearLbl.style.backgroundColor = 'rgb('+(d.rpm/7000)*255+',0,0)';
  speedLbl.innerText = Math.floor(d.speed);
  
}

window.join = (v) => {

  if(v != '') {
    if(checkChars(v) == true) {
      if(v.length <= 10) {
      // Good
      socket.emit('setName', v);
      overlayStat.innerText = 'Verifying..';
      } else {
        alert('Name is too long!');
      }
    } else {
      alert("No special characters and symbols!");
    }

  } else {
    alert("Type in a username, please!");
  }
}

const displayMsg = (msg) => {
  let ele = document.createElement('div');
  ele.setAttribute('class', 'chatbox_msg');
  ele.innerText = msg;
  chatbox.appendChild(ele);
  chatbox.scrollBy(0,100); // scroll
}

window.sendMessage = (e) => {
  if(e.key === "Enter") {
    
    if(!e.target.value.startsWith('/')) {
    if(e.target.value.length > 200) e.target.value = e.target.value.slice(0,200);
    socket.emit('chat', e.target.value); // send
    // Normal chat
    } else {
      let f = e.target.value.split(' ');
      if(f[0] === '/createObject') { // test
        f = e.target.value.slice(13,e.target.value.length);
        console.log(f);
        try {
        f = JSON.parse(f);
        if(f.length == 7) {
          socket.emit('createObject', ...f);
        } else {
          console.log(f.length);
          displayMsg(`[System]: Invalid arguments. Valid: /createObject [{"name": "box", "height": 2, "width": 2, "depth": 2},{"name":"phong","color": {"r":1,"g":0.5,"b": 0.5}},1,{"x":0,"y":10,"z":0},{"x":0,"y":0,"z":0},{"x":0,"y":0,"z":0},{"x":0,"y":0,"z":0}]`);
        }
        } catch(err) {
          console.log(err);
          displayMsg(`[System]: Failed to parse. Valid: /createObject [{"name": "box", "height": 2, "width": 2, "depth": 2},{"name":"phong","color": {"r":1,"g":0.5,"b": 0.5}},1,{"x":0,"y":10,"z":0},{"x":0,"y":0,"z":0},{"x":0,"y":0,"z":0},{"x":0,"y":0,"z":0}]`);
        }
      }
    }
    chatboxInput.value = ""; // clear
    chatboxInput.blur(); // unselect
  }
}
chatboxInput.onfocus = () => {
  canMove = false;
}
chatboxInput.onblur = () => {
  canMove = true;
}

socket.on('setName_pass', () => {
  overlay.style.display = 'none'; // Done!
  canMove = true; // Start movign
});

socket.on('setName_error', () => {
  overlayStat.style.color = 'yellow';
  overlayStat.innerText = 'This name was already taken.';
});

socket.on('chat', displayMsg);

socket.on('connect', () => {
  socketId = socket.id;
});

socket.on('client_driveVehicle', (e) => {
  if(e == true) {
    // In vehicle
    vehc.style.display = 'block'; // Show now
    canMove = false;
    inVehicle = true;
  } else {
    vehc.style.display = 'none';
    canMove = true;
    inVehicle = false;
  }
});

window.flipVehicle = () => {
  if(inVehicle == true) {
    socket.emit('client_flipVehicle');
  }
}

window.deleteVehicle = () => {
  if(inVehicle == true) {
    socket.emit('client_deleteVehicle');
  }
}

document.body.addEventListener('keydown', (e) => {
  keys.add(e.key.toLowerCase());

  if(e.key.toLowerCase() == 'e' && canMove ==true) {
    socket.emit('client_driveVehicle'); // Try to go in
  }
  if(e.key == ' ') {
    if(inVehicle == true) socket.emit('client_exitVehicle');
  }
});

document.body.addEventListener('keyup', (e) => {
  keys.delete(e.key.toLowerCase());
  if(e.key == '/') chatboxInput.focus();

  if(e.key == '`') {
    if(statC.style.display != 'none') {
      statC.style.display = 'none';
    } else {
      statC.style.display = '';
    }
  }

  if(e.key == 'f') window.flipVehicle();
  
});


const movePlayer = () => {
  if(clientObj) { 
    controls.clientObj = clientObj;
    if(!previousPos) previousPos = clientObj.position.clone();
    let diff = clientObj.position.clone().sub(previousPos);
    camera.position.add(diff);
    orbitControls.target.copy(clientObj.position);
    orbitControls.update();

    previousPos.copy(clientObj.position);

    if(canMove == true) {

      controls.velocDir.set(0,0,0);

      if(keys.has('w')) {
        controls.moveForward(5);
      }
      if(keys.has('s')) {
        controls.moveForward(-5);
      }
      if(keys.has('a')) {
        controls.moveRight(-5);
      }
      if(keys.has('d')) {
        controls.moveRight(5);
      }
      if(keys.has(' ')) {
        socket.emit('client_jump');
      }

    } else {
      if(inVehicle == true) driveVehicle();
    }

  }
}

const driveVehicle = () => {
  let dir = 'NOT_DEFINED';
  let pwr = 'NOT_DEFINED';
  let brk = 'NOT_DEFINED';

  if(keys.has('w')) {
    pwr = true;
  }

  if(keys.has('s')) {
    pwr = 2;
  }

  if(keys.has('d')) {
    dir = 1;
  }
  if(keys.has('a')) {
    dir = -1;
  }
  if(!keys.has('d') && !keys.has('a')) {
    dir = null;
  }
  if(!keys.has('w') && !keys.has('s')) {
    pwr = null;
    brk = [2,3];
  }
  socket.emit('client_controlVehicle', dir,pwr,brk);
}

const render = () => {
  requestAnimationFrame(render);
  ping = performance.now() - lastPing;
  movePlayer();
  scene.setGravity(new THREE.Vector3(0,-12.87,0));

 if(scene.simulate(1000/serverRelativeFPS, 1) != false) {
   localSimFrame++;
 }
  // Advance client-side simulation

  renderer.render(scene,camera);
}


const init = () => {
  camera = new THREE.PerspectiveCamera(70, window.innerWidth/window.innerHeight, 0.1, 1000);

  scene = new Physijs.Scene({fixedTimeStep: 1/60});

  scene.onLoad = () => {
    sceneHasLoaded = true;

    scene.setGravity(new THREE.Vector3(0,-9.87,0));


    // Background
    let bt = new THREE.CubeTextureLoader().load([
      "img/background.jpg",
      "img/background.jpg",
      "img/background.jpg",
      "img/background.jpg",
      "img/background.jpg",
      "img/background.jpg",
    ]);

    scene.background = bt;

    renderer = new THREE.WebGLRenderer();
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setSize(window.innerWidth,window.innerHeight);
    document.body.appendChild(renderer.domElement);

    window.addEventListener('resize', () => {
      renderer.setSize(window.innerWidth,window.innerHeight);
      camera.aspect = window.innerWidth/window.innerHeight;
      camera.updateProjectionMatrix();
    });

    camera.position.set(5,5,5);

    controls = new PointerLockControls(
      camera,
      renderer.domElement,
      socket
    );
    orbitControls = new OrbitControls(
      camera,
      renderer.domElement
    );
    pointerLocked = true;
    controls.isLocked = true;

    vehiclePrompt = generateTextSprite('Press E to enter', {
    fontSize: 20,
    borderThickness: 0,
    textAlign: 'center',
    });
    vehiclePrompt.scale.set(8,1,1);

    getFPS();
    render();

  }
}

const getFPS = () => {
  let curr = renderer.info.render.frame;
  let ser = serverFrame;
  let l = localSimFrame;

  setTimeout(() => {
    fps = renderer.info.render.frame - curr;
    serverRelativeFPS = serverFrame - ser;
    localPhysFPS = localSimFrame - l;

    stat1.innerText = 'Render: '+fps+' / Network: '+serverRelativeFPS;
    stat2.innerText = 'Server: '+serverFPS+' / Client: ' + localPhysFPS;
    stat3.innerText = 'Rate: '+ (Math.floor((serverRelativeFPS/serverFPS)*100)) + '%' +' / Ping: '+ ping.toFixed(2) + 'ms';

    getFPS();

  },1000);
}



let foundPrompt = false;

socket.on('simulate', (dat) => {

  if(sceneHasLoaded == true) {

    serverFrame++;
    serverFPS = dat.fps;
    ping = (performance.now()-lastPing);
    foundPrompt = false;
    lastPing = performance.now();

    if(dat.frame > lastServFrame) {

      for(let i = 0; i < dat.objects.length;i++) {

        let obj = dat.objects[i];
        if(!objID.includes(obj.id)) {
          makeObject(obj);
        } else {
          let ob = objects[objID.indexOf(obj.id)];

          // move stor
          ob._server.positionMovement = obj.positionMovement || new THREE.Vector3();
          ob._server.rotationMovement = obj.rotationMovement || new THREE.Vector3();

          if(ob._isLight == true && ob.target) {
            ob.target.position.set(obj.geometry.target.x,obj.geometry.target.y,obj.geometry.target.z);
          }

          if(obj.playerId == socketId) {
            clientObj = ob;
            controls.lastVelocity.set(obj.lastLinVeloc.x,obj.lastLinVeloc.y,obj.lastLinVeloc.z);
          }
          if(obj.playerId != undefined) {
            ob._isAPlayer = true;
            if(!ob.textSprite && obj._playerName != undefined) {
              createSprite(ob,obj._playerName);
            }
          }

          if(obj.__vehicleClientInfo && obj.__vehicleClientInfo.socketId == socketId) {
            updateVehicle(obj.__vehicleClientInfo);
          }
          if(obj.__hasDriver == false && clientObj && new THREE.Vector3(obj.position.x,obj.position.y,obj.position.z).distanceTo(clientObj.position) < 5) {
            // show prompt
            foundPrompt = obj.position;
          }
          
          if(obj.forceUpdate == true || ob.forceUpdate == true || obj._doNotSimulate == true) {

            ob.forceUpdate = false;
            ob.position.set(
              obj.position.x,
              obj.position.y,
              obj.position.z,
            );
            ob.rotation.set(
              obj.rotation.x,
              obj.rotation.y,
              obj.rotation.z,
            );
            ob.__dirtyPosition = true;
            ob.__dirtyRotation = true;
          }

          if(ob.setLinearVelocity) {
            ob.setLinearVelocity(
              new THREE.Vector3(
                obj.lastLinVeloc.x,
                obj.lastLinVeloc.y,
                obj.lastLinVeloc.z,
              )
            );
            ob.setAngularVelocity(
              new THREE.Vector3(
                obj.lastAngVeloc.x,
                obj.lastAngVeloc.y,
                obj.lastAngVeloc.z,
              )
            )
          }

        }

      }

      removeObjects(dat.objects);
    }

  }

  lastServFrame = dat.frame;

  if(foundPrompt != false && inVehicle == false) {
    // found
    vehiclePrompt.position.set(foundPrompt.x,foundPrompt.y+2,foundPrompt.z);
    if(!scene.children.includes(vehiclePrompt)) scene.add(vehiclePrompt);
  } else {
    if(scene.children.includes(vehiclePrompt)) scene.remove(vehiclePrompt);
  }

});

const createSprite = (ob,n) => {

  let e = generateTextSprite(n, {
    fontSize: 20,
    borderThickness: 1,
    textAlign: 'center',
  });
  e.position.set(0,1.5,0);
  e.scale.set(1.7,0.7,0.7);
  ob.textSprite = e;
  ob.add(ob.textSprite);
}

const removeObjects = (gr) => {

  let ids=  [];
  for(let gro of gr) ids.push(gro.id); // populate id arr

  for(let i = 0; i< objects.length;i++) {
    let obj = objects[i];
    if(obj && obj.__serverObjectID) {
      if(!ids.includes(obj.__serverObjectID)) {
        // no t included in data

        if(scene.children.includes(obj)) {
          if(obj.geometry && obj.material) {
            obj.geometry.dispose();
            obj.material.dispose();
          }
          scene.remove(obj);

          // From arry
          objID.splice(objID.indexOf(obj.__serverObjectID),1);
          objects.splice(i,1);
          if(i > 0) i -=  1;
        }
      }
    }
  }
}

const geometries = {
  'box': THREE.BoxGeometry,
  'sphere': THREE.SphereGeometry,
  'plane': THREE.PlaneGeometry,
  'cylinder': THREE.CylinderGeometry,
}

const materials = {
  'basic': THREE.MeshBasicMaterial,
  'phong': THREE.MeshPhongMaterial,
  'lambert': THREE.MeshLambertMaterial,
}

const lights =  {
  'spot': THREE.SpotLight,
  'ambient': THREE.AmbientLight,
  'hemisphere': THREE.HemisphereLight
}

const physiMesh = {
  'box': Physijs.BoxMesh,
  'plane': Physijs.BoxMesh,
  'sphere': Physijs.SphereMesh,
  'cylinder': Physijs.CylinderMesh,
}

const makeObject = (obj) => {
  let geo;
  let ob;
  if(obj.geometry.lightType == undefined) {
    // Not a light
    let objColor = new THREE.Color(
      obj.material.color.r,
      obj.material.color.g,
      obj.material.color.b,
    );
    let mat = new materials[obj.material.name]({});
    if(!obj.texture) {
      mat.color = objColor;
    } else {
      mat.map = new THREE.TextureLoader().load(obj.texture);
      if(obj.textureRepeat) {
        mat.map.wrapS = THREE.RepeatWrapping;
        mat.map.wrapT = THREE.RepeatWrapping;
        mat.map.repeat.set(obj.textureRepeat,obj.textureRepeat);
      }
    }
  if(obj.geometry.name == 'box') {
    geo = new geometries.box(obj.geometry.height,obj.geometry.width,obj.geometry.depth);
  }
  if(obj.geometry.name == 'plane') {
    geo = new geometries.plane(obj.geometry.width,obj.geometry.height);
  }
  if(obj.geometry.name == 'sphere') {
    geo = new geometries.sphere(obj.geometry.radius,16,16);
  }
  if(obj.geometry.name == 'cylinder') {
    geo = new geometries.cylinder(obj.geometry.x,obj.geometry.y,obj.geometry.z,16);
    geo.rotateX(obj.geometry.rotation[0]);
    geo.rotateY(obj.geometry.rotation[1]);
    geo.rotateZ(obj.geometry.rotation[2]);
  }
  let tai = obj._doNotSimulate === true ? THREE.Mesh : physiMesh[obj.geometry.name];
  ob = new tai(
    geo,
    Physijs.createMaterial(mat,obj.material.friction,obj.material.restitution),
    obj.mass,
  )
  ob.castShadow = true;
  ob.receiveShadow = true;
  } else {
    // Is a lite
    ob = new lights[obj.geometry.lightType](...obj.geometry.lightParams);
    ob._isLight = true;
    if(ob.target) {
      scene.add(ob.target);
      ob.target.position.set(
        obj.geometry.target.x,
        obj.geometry.target.y,
        obj.geometry.target.z
      );
    }
    if(obj.shadowCameraNear) {
      ob.shadow.camera.near = obj.shadowCameraNear;
      ob.shadow.camera.far = obj.shadowCameraFar;
    }
    if(obj.geometry.lightType != 'ambient') {
      ob.castShadow = true;
    }
  }
  ob.forceUpdate = true;
  ob.__serverObjectID = obj.id;
  ob._server = {
    // Server stuff
  }
  objects.push(ob);
  objID.push(obj.id);
  scene.add(ob);
}

init();