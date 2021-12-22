import {Euler, Vector3} from 'https://threejs.org/build/three.module.js'

let PointerLockControls = function (camera, domElement, socket) {
  this.domElement = domElement;
  this.isLocked = false;
  var scope = this;
  this.clientObj = undefined;
  // Set to constrain the pitch of the camera
  // Range is 0 to Math.PI radians
  this.minPolarAngle = 0; // radians
  this.maxPolarAngle = Math.PI; // radians

  var euler = new Euler(0, 0, 0, "YXZ");

  var PI_2 = Math.PI / 2;

  var vec = new Vector3();

  this.lastVelocity = new Vector3();
  this.velocDir = new Vector3();

  function onMouseMove(event) {
    if(scope.isLocked == true) {
    var movementX = event.movementX || event.mozMovementX || event.webkitMovementX || 0;
    var movementY = event.movementY || event.mozMovementY || event.webkitMovementY || 0;

    euler.setFromQuaternion(camera.quaternion);

    euler.y -= movementX * 0.002;
    euler.x -= movementY * 0.002;

    euler.x = Math.max(PI_2 - scope.maxPolarAngle, Math.min(PI_2 - scope.minPolarAngle, euler.x));

    camera.quaternion.setFromEuler(euler);
    }
  }
//  document.body.addEventListener("mousemove", onMouseMove);

  this.dispose = function () {
    this.disconnect();
  };

  this.getObject = function () { // retaining this method for backward compatibility
    return camera;
  };

  this.getDirection = function () {
    var direction = new Vector3(0, 0, -1);

    return function (v) {
      return v.copy(direction).applyQuaternion(camera.quaternion);
    };
  }();

  this.moveForward = function (distance,out) {
    if(scope.isLocked == true) {


    // move forward parallel to the xz-plane
    // assumes camera.up is y-up

    vec.setFromMatrixColumn(camera.matrix, 0);

    vec.crossVectors(camera.up, vec);

   // var v = new Vector3() //.copy(scope.lastVelocity)
    //v.addScaledVector(vec, distance);

    // update
    if(out === undefined) {
    scope.velocDir.addScaledVector(vec,distance);
    socket.volatile.emit('client_addVelocity', vec,distance, Math.abs(distance));
    if(scope.clientObj) {
      scope.clientObj.applyCentralImpulse(new Vector3(vec).multiplyScalar(distance));
    }
  } else {
    return vec.clone().multiplyScalar(distance);
  }
    }

  };

  this.moveRight = function (distance,out) {
    if(scope.isLocked == true) {
    vec.setFromMatrixColumn(camera.matrix, 0);
    //var v = new Vector3() //.copy(scope.lastVelocity);
    //v.addScaledVector(vec, distance);
    if(out === undefined) {
        scope.velocDir.addScaledVector(vec,distance);

    socket.volatile.emit('client_addVelocity',vec,distance, Math.abs(distance))
    if(scope.clientObj) {
      scope.clientObj.applyCentralImpulse(new Vector3(vec).multiplyScalar(distance));
    }
  } else {
    return vec.clone().multiplyScalar(distance);
  }
    }
  };

  this.lock = function () {
    this.domElement.requestPointerLock();
  };

  this.unlock = function () {
    document.exitPointerLock();
  };
};

export default PointerLockControls;
