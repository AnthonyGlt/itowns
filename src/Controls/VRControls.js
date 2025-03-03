import * as THREE from 'three';
import Coordinates from 'Core/Geographic/Coordinates';
import DEMUtils from 'Utils/DEMUtils';
import { XRControllerModelFactory } from 'ThreeExtended/webxr/XRControllerModelFactory';

/**
 * Controller.userData {
 *   isSelecting,
 *  lockedTeleportPosition
 * }
 * Requires a contextXR variable.
 * @param {*} _view itowns view object
 * @param {*} _groupXR XR 3D object group
 */
class VRControls {
    static MIN_DELTA_ALTITUDE = 1.8;

    constructor(_view, _groupXR = {}) {
    // Store instance references.
        this.view = _view;
        this.groupXR = _groupXR;
        this.webXRManager = _view.mainLoop.gfxEngine.renderer.xr;

        this.rightButtonPressed = false;
        this.controllers = [];
        // this.controllers = {};
        this.initControllers();
        this.initMarker();
    }

    // Static factory method:
    static init(view, vrHeadSet) {
        return new VRControls(view, vrHeadSet);
    }


    initControllers() {
        //  Add a light for the controllers
        this.groupXR.add(new THREE.HemisphereLight(0xa5a5a5, 0x898989, 3));
        this.raycaster = new THREE.Raycaster();
        this.raycaster.params.Points.threshold = 0.5;   //  buffer of precision
        const controllerModelFactory = new XRControllerModelFactory();

        for (let i = 0; i < 2; i++) {
            const controller = this.webXRManager.getController(i);


            controller.addEventListener('connected', (event) => {
                controller.name = event.data.handedness;    // Left or right
                controller.userData.handedness = event.data.handedness;
                // bindControllerListeners(controller, vrHeadSet);
                controller.gamepad = event.data.gamepad;
                this.groupXR.add(controller);
                controller.add(this.buildControllerRay(event.data));
                const gripController = this.webXRManager.getControllerGrip(i);
                gripController.name = `${controller.name}GripController`;
                gripController.userData.handedness = event.data.handedness;
                this.bindGripController(controllerModelFactory, gripController, this.groupXR);
                this.controllers.push(controller);
                // this.controllers[controller.name] = controller;
                this.groupXR.add(gripController);


                // Event listeners
                this.setupEventListeners(controller);
            });

            controller.addEventListener('disconnected', function removeCtrl() {
                this.remove(this.children[0]);
            });
        }
    }
    initMarker() {
        this.marker = new THREE.Mesh(
            // new THREE.CircleGeometry(2005, 32).rotateX(-Math.PI / 2),
            new THREE.SphereGeometry(1, 32, 32),
            new THREE.MeshBasicMaterial({ color: 0xFF0000 }),
        );
        this.marker.visible = false;
        this.view.scene.add(this.marker);

        this.selectMarker1 = new THREE.Mesh(
            // new THREE.CircleGeometry(2005, 32).rotateX(-Math.PI / 2),
            new THREE.SphereGeometry(1, 32, 32),
            new THREE.MeshBasicMaterial({ color: 0x00FF00 }),
        );
        this.selectMarker1.visible = false;
        this.view.scene.add(this.selectMarker1);

        this.selectMarker2 = new THREE.Mesh(
            // new THREE.CircleGeometry(2005, 32).rotateX(-Math.PI / 2),
            new THREE.SphereGeometry(1, 32, 32),
            new THREE.MeshBasicMaterial({ color: 0x0000FF }),
        );
        this.selectMarker2.visible = false;
        this.view.scene.add(this.selectMarker2);
    }


    bindGripController(controllerModelFactory, gripController, vrHeadSet) {
        gripController.add(controllerModelFactory.createControllerModel(gripController));
        vrHeadSet.add(gripController);
    }

    buildControllerRay(data) {
        let geometry; let
            material; let ctrlHelper;

        switch (data.targetRayMode) {
            case 'tracked-pointer':

                geometry = new THREE.BufferGeometry();
                geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, -1], 3));
                geometry.setAttribute('color', new THREE.Float32BufferAttribute([0.5, 0.5, 0.5, 0, 0, 0], 3));

                material = new THREE.LineBasicMaterial({ vertexColors: true, blending: THREE.AdditiveBlending });
                ctrlHelper = new THREE.Line(geometry, material);
                ctrlHelper.name = 'ctrlHelper';
                return ctrlHelper;

            case 'gaze':

                geometry = new THREE.RingGeometry(0.02, 0.04, 32).translate(0, 0, -1);
                material = new THREE.MeshBasicMaterial({ opacity: 0.5, transparent: true });
                ctrlHelper = new THREE.Mesh(geometry, material);
                ctrlHelper.name = 'ctrlHelper';
                return ctrlHelper;
            default:
                return null;
        }
    }

    getController(handedness) {
        return this.controllers.filter(o => o.name === handedness)[0];
    }

    // Register event listeners for controllers.
    setupEventListeners(controller) {
        controller.addEventListener('itowns-xr-axes-changed', e => this.onAxisChanged(e));
        controller.addEventListener('itowns-xr-axes-stop', e => this.onAxisStop(e));
        controller.addEventListener('itowns-xr-button-pressed', e => this.onButtonPressed(e));
        controller.addEventListener('itowns-xr-button-released', e => this.onButtonReleased(e));

        controller.addEventListener('selectstart', e => this.onSelectStart(e));
        controller.addEventListener('selectend', e => this.onSelectEnd(e));
    }


    /*
Listening {XRInputSource} and emit changes for convenience user binding,
There is NO JOYSTICK Events so we need to check it ourselves
Adding a few internal states for reactivity
- controller.isStickActive      {boolean} true when a controller stick is not on initial state.
*/

    listenGamepad() {
        for (const controller of this.controllers) {
            if (!controller.gamepad) {
                return;
            }
            // gamepad.axes = [0, 0, x, y];

            const gamepad = controller.gamepad;
            const activeValue = gamepad.axes.some(value => value !== 0);

            // Handle stick activity state
            if (controller.isStickActive && !activeValue && controller.gamepad.endGamePadtrackEmit) {
                controller.dispatchEvent({
                    type: 'itowns-xr-axes-stop',
                    message: { controller },
                });
                controller.isStickActive = false;
                return;
            } else if (!controller.isStickActive && activeValue) {
                controller.gamepad.endGamePadtrackEmit = false;
                controller.isStickActive = true;
            } else if (controller.isStickActive && !activeValue) {
                controller.gamepad.endGamePadtrackEmit = true;
            }

            if (activeValue) {
                controller.dispatchEvent({
                    type: 'itowns-xr-axes-changed',
                    message: { controller },
                });
            }

            for (const [index, button] of gamepad.buttons.entries()) {
                if (button.pressed) {
                    // 0 - trigger
                    // 1 - grip
                    // 3 - stick pressed
                    // 4 - bottom button
                    // 5 - upper button
                    controller.dispatchEvent({
                        type: 'itowns-xr-button-pressed',
                        message: {
                            controller,
                            buttonIndex: index,
                            button,
                        },
                    });
                    controller.lastButtonItem = button;
                } else if (controller.lastButtonItem && controller.lastButtonItem === button) {
                    controller.dispatchEvent({
                        type: 'itowns-xr-button-released',
                        message: {
                            controller,
                            buttonIndex: index,
                            button,
                        },
                    });
                    controller.lastButtonItem = undefined;
                }

                if (button.touched) {
                    // triggered really often
                }
            }
        }
    }

    createLine(pt1, pt2) {
        const material = new THREE.LineBasicMaterial({
            color: 0xff00ff,
        });


        const geometry = new THREE.BufferGeometry().setFromPoints([pt1, pt2]);

        this.line = new THREE.Line(geometry, material);
        this.view.scene.add(this.line);
        this.createText(Math.abs(pt1.distanceTo(pt2)));
    }

    createText(txt) {
        this.canvas = document.createElement('canvas');
        this.canvas.width = 512;
        this.canvas.height = 256;
        const canvas = this.canvas;

        // const context = this.canvas.getContext('2d');
        // context.fillStyle = '#ffffff';
        // context.fillRect(0, 0, this.canvas.width, this.canvas.height);
        // context.font = '60px Arial';
        // context.fillStyle = '#000000';
        // context.textAlign = 'center';
        // context.fillText('Hello VR', this.canvas.width / 2, this.canvas.height / 2);

        const context = canvas.getContext('2d');
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.font = '48px sans-serif';
        context.fillStyle = 'white';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(`${txt}`, canvas.width / 2, canvas.height / 2);
        this.texture = new THREE.CanvasTexture(this.canvas);
        const material = new THREE.MeshBasicMaterial({ map: this.texture, transparent: true });
        const plane = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.1), material);
        // Position the mesh above the controller
        plane.position.set(0, 0.2, 0); // tweak these values as needed

        // Attach the canvasMesh to the controller
        this.getController('right').add(plane);
    }
    updateCanvasText(newText) {
        const context = this.canvas.getContext('2d');

        // Clear the previous text
        context.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Redraw the new text
        context.fillText(`${newText}`, this.canvas.width / 2, this.canvas.height / 2);

        // Mark the texture for an update
        this.texture.needsUpdate = true;
    }
    updateLine(pt1, pt2) {
        if (!this.line) {
            return this.createLine(pt1, pt2);
        }
        // Assuming this.line already exists and its geometry has 2 vertices
        // const positions = this.line.geometry.attributes.position.array;
        //
        // // Update first point (pt1)
        // positions[0] = pt1.x;
        // positions[1] = pt1.y;
        // positions[2] = pt1.z;
        //
        // // Update second point (pt2)
        // positions[3] = pt2.x;
        // positions[4] = pt2.y;
        // positions[5] = pt2.z;

        // this.line.setFromPoints(pt1, pt2);

        // update line points position
        this.line.geometry.setFromPoints([pt1, pt2]);
        this.line.computeLineDistances(); //
        // Flag the position attribute for update
        this.line.geometry.attributes.position.needsUpdate = true;
        this.line.visible = true;

        this.updateCanvasText(Math.abs(pt1.distanceTo(pt2)));
    }

    updateMarker(marker = this.marker) {
        const ctrl = this.getController('right');
        this.raycaster.setFromXRController(ctrl);
        // const interactiveLayers =  [];
        const interactiveLayers = this.view.getLayers().filter(l => l.isOGC3DTilesLayer).map(o => o.object3d);

        // const intersects = this.raycaster.intersectObjects(interactiveLayers, true);
        const intersects = this.raycaster.intersectObjects(interactiveLayers);
        const line = ctrl.getObjectByName('ctrlHelper');

        if (intersects.length > 0) {
            this.INTERSECTION = intersects[0].point;
            // this.INTERSECTION = this.clampToGround(intersects[0].point);

            // const object =  intersects[0].object;
            // object.material.emissive.r = 1;
            // intersected.push( object );
            // const scale = Math.max(1, intersects[0].distance / 200);
            const scale = intersects[0].distance / 200;
            // console.log(scale);
            marker.scale.set(scale, scale, scale);
            line.scale.z =  intersects[0].distance;
            marker.position.copy(this.INTERSECTION);
            marker.updateMatrixWorld(true);
        } else {
            this.INTERSECTION = undefined;
            line.scale.z = 5;
        }

        marker.visible = this.INTERSECTION !== undefined;
    }


    // Clamp a translation to ground and then apply the transformation.
    clampAndApplyTransformationToXR(trans, offsetRotation) {
        const transClamped = this.clampToGround(trans);
        this.applyTransformationToXR(transClamped, offsetRotation);
    }

    // Apply a translation and rotation to the XR group.
    applyTransformationToXR(trans, offsetRotation) {
        if (!offsetRotation) {
            console.error('missing rotation quaternion');
            return;

            // offsetRotation = this.groupXR.quaternion;
        }

        if (!trans) {
            console.error('missing translation vector');
            return;
        }

        this.groupXR.position.copy(trans);
        this.groupXR.quaternion.copy(offsetRotation);
        this.groupXR.updateMatrixWorld(true);
    }

    /**
   * Clamp the given translation vector so that the camera remains at or above ground level.
   * @param {Vector3} trans - The translation vector.
   * @returns {Vector3} The clamped coordinates as a Vector3.
   */
    clampToGround(trans) {
        const transCoordinate = new Coordinates(
            this.view.referenceCrs,
            trans.x,
            trans.y,
            trans.z,
        );

        const terrainElevation = DEMUtils.getElevationValueAt(
            this.view.tileLayer,
            transCoordinate,
            DEMUtils.PRECISE_READ_Z,
        ) || 0;

        if (terrainElevation == null) {
            console.error('no elevation intersection possible');
            return trans;
        }

        if (this.view.controls.getCameraCoordinate) {
            const coordsProjected = transCoordinate.as(this.view.controls.getCameraCoordinate().crs);
            if (coordsProjected.altitude - terrainElevation - VRControls.MIN_DELTA_ALTITUDE <= 0) {
                coordsProjected.altitude = terrainElevation + VRControls.MIN_DELTA_ALTITUDE;
            }
            return coordsProjected.as(this.view.referenceCrs).toVector3();
        } else {
            return trans;
        }
    }

    // Calculate a speed factor based on the camera's altitude.
    getSpeedFactor() {
        const altitude = this.view.controls.getCameraCoordinate ? this.view.controls.getCameraCoordinate().altitude : 1;
        return Math.min(Math.max(altitude / 50, 2), 2000); // TODO: Adjust if needed -> add as a config ?
    }

    // Calculate a yaw rotation quaternion based on an axis value from the joystick.
    getRotationYaw(axisValue) {
        // Clone the current XR group's orientation.
        const baseOrientation = this.groupXR.quaternion.clone().normalize();
        let deltaRotation = 0;

        if (axisValue) {
            deltaRotation = -Math.PI * axisValue / 140; // Adjust sensitivity as needed.
        }
        // Get the "up" direction from the camera coordinate. // TODO should we handle other than globe ?
        const upAxis = this.groupXR.position.clone().normalize();
        // Create a quaternion representing a yaw rotation about the up axis.
        const yawQuaternion = new THREE.Quaternion()
            .setFromAxisAngle(upAxis, deltaRotation)
            .normalize();
        // Apply the yaw rotation.
        baseOrientation.premultiply(yawQuaternion);
        return baseOrientation;
    }

    // Calculate a pitch rotation quaternion based on an axis value from the joystick.
    getRotationPitch(axisValue) {
    // Clone the current XR group's orientation.
        const baseOrientation = this.groupXR.quaternion.clone().normalize();
        let deltaRotation = 0;

        if (axisValue) {
            deltaRotation = -Math.PI * axisValue / 140; // Adjust sensitivity as needed.
        }

        // Compute the right axis from the current orientation.
        // (Assuming (1, 0, 0) is the right direction in local space.)
        const rightAxis = new THREE.Vector3(1, 0, 0)
            .applyQuaternion(baseOrientation)
            .normalize();

        // Create a quaternion representing a pitch rotation about the right axis.
        const pitchQuaternion = new THREE.Quaternion()
            .setFromAxisAngle(rightAxis, deltaRotation)
            .normalize();

        // Apply the pitch rotation.
        baseOrientation.premultiply(pitchQuaternion);
        return baseOrientation;
    }

    // Compute a translation vector for vertical adjustment.
    getTranslationElevation(axisValue, speedFactor) {
        const speed = axisValue * speedFactor;
        // const direction = this.view.controls.getCameraCoordinate().geodesicNormal.clone();
        const direction = this.view.camera3D.position.clone().normalize();

        direction.multiplyScalar(-speed);
        return direction;
    }

    // Handles camera flying based on controller input.
    cameraOnFly(ctrl) {
        let directionX = new THREE.Vector3();
        let directionZ = new THREE.Vector3();
        const speedFactor = this.getSpeedFactor();
        if (ctrl.gamepad.axes[3] !== 0) {
            const speed = ctrl.gamepad.axes[3] * speedFactor;
            directionZ = new THREE.Vector3(0, 0, 1)
                .applyQuaternion(this.view.camera3D.quaternion.clone().normalize())
                .multiplyScalar(speed);
        }
        if (ctrl.gamepad.axes[2] !== 0) {
            const speed = ctrl.gamepad.axes[2] * speedFactor;
            directionX = new THREE.Vector3(1, 0, 0)
                .applyQuaternion(this.view.camera3D.quaternion.clone().normalize())
                .multiplyScalar(speed);
        }
        const offsetRotation = this.groupXR.quaternion.clone();
        const trans = this.groupXR.position.clone().add(directionX.add(directionZ));
        // this.applyTransformationToXR(trans, offsetRotation);
        this.clampAndApplyTransformationToXR(trans, offsetRotation);
    }

    /* =======================
     Event Handler Methods
     ======================= */

    // Right select ends.
    INTERSECTION;
    getIntersections(controller) {
        controller.updateMatrixWorld();

        this.raycaster.setFromXRController(controller);

        // return this.raycaster.intersectObjects( group.children, false );
    }

    intersectObjects(controller) {
        // Do not highlight in mobile-ar

        if (controller.userData.targetRayMode === 'screen') { return; }

        // Do not highlight when already selected

        if (controller.userData.selected !== undefined) { return; }

        const line = controller.getObjectByName('line');
        const intersections = this.getIntersections(controller);

        if (intersections.length > 0) {
            const intersection = intersections[0];

            const object = intersection.object;
            object.material.emissive.r = 1;
            // intersected.push( object );

            line.scale.z = intersection.distance;
        } else {
            line.scale.z = 5;
        }
    }

    onSelectRightEnd() {
    // Uncomment and implement teleportation if needed:
        this.INTERSECTION = undefined;
    }

    // Right select starts.
    onSelectRightStart(ctrl) {
    // No operation needed yet.

        // const tempMatrix = new THREE.Matrix4();
        // tempMatrix.identity().extractRotation(ctrl.matrixWorld);

        // this.raycaster.ray.origin.setFromMatrixPosition(ctrl.matrixWorld);
        // this.raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);
        if (this.selectMarker1.visible) {
            if (this.selectMarker1.visible && this.selectMarker2.visible) {
                this.selectMarker1.visible = false;
                this.selectMarker2.visible = false;
                this.line.visible = false;
                this.updateMarker(this.selectMarker1);
                return;
            }
            this.updateMarker(this.selectMarker2);
            this.updateLine(this.selectMarker1.position, this.selectMarker2.position);
        } else {
            this.updateMarker(this.selectMarker1);
        }
    }

    // Left select starts.
    onSelectLeftStart() {
    // No operation needed yet.
    }

    // Left select ends.
    onSelectLeftEnd() {
        // No operation needed yet.
    }
    onSelectStart(data) {
        const ctrl = data.target;

        if (ctrl.userData.handedness === 'left') {
            this.onSelectLeftStart(ctrl);
        } else if (ctrl.userData.handedness === 'right') {
            this.onSelectRightStart(ctrl);
        }
    }
    onSelectEnd(data) {
        const ctrl = data.target;

        if (ctrl.userData.handedness === 'left') {
            this.onSelectRightEnd(ctrl);
        } else if (ctrl.userData.handedness === 'right') {
            this.onSelectLeftEnd(ctrl);
        }
    }
    onButtonPressed(data) {
        const ctrl = data.target;
        if (ctrl.userData.handedness === 'left') {
            this.onLeftButtonPressed(data);
        } else if (ctrl.userData.handedness === 'right') {
            this.onRightButtonPressed(data);
        }
    }

    // Right button pressed.
    onRightButtonPressed(data) {
        const ctrl = data.target;
        if (data.message.buttonIndex === 1) {
            // Activate vertical adjustment.
            if (ctrl.gamepad.axes[3] === 0) {
                return;
            }
            this.rightButtonPressed = true;
        }
    }

    // Left button pressed.
    onLeftButtonPressed() {
    // No operation defined.
    }

    // Axis changed.
    onAxisChanged(data) {
        const ctrl = data.target;
        if (ctrl.gamepad.axes[2] === 0 && ctrl.gamepad.axes[3] === 0) {
            return;
        }
        if (ctrl.userData.handedness === 'left') {
            this.onLeftAxisChanged(ctrl);
        } else if (ctrl.userData.handedness === 'right') {
            this.onRightAxisChanged(ctrl);
        }
    }

    // Right axis changed.
    onRightAxisChanged(ctrl) {
        if (ctrl.userData.handedness !== 'right') {
            return;
        }
        //  Check if GRIP is pressed
        if (this.rightButtonPressed) {
            const offsetRotation = this.groupXR.quaternion.clone();
            const speedFactor = this.getSpeedFactor();
            const deltaTransl = this.getTranslationElevation(ctrl.gamepad.axes[3], speedFactor);
            const trans = this.groupXR.position.clone().add(deltaTransl);
            this.clampAndApplyTransformationToXR(trans, offsetRotation);
        } else {
            this.cameraOnFly(ctrl);
        }
    }

    // Left axis changed.
    onLeftAxisChanged(ctrl) {
        if (ctrl.userData.handedness !== 'left') {
            return;
        }

        const trans = this.groupXR.position.clone();
        let offsetRotation;

        //  Only apply rotation on 1 axis at the time
        if (Math.abs(ctrl.gamepad.axes[2]) > Math.abs(ctrl.gamepad.axes[3])) {
            offsetRotation = this.getRotationYaw(ctrl.gamepad.axes[2]);
        } else {
            offsetRotation = this.getRotationPitch(ctrl.gamepad.axes[3]);
        }

        this.applyTransformationToXR(trans, offsetRotation);
    }

    // Right axis stops.
    onAxisStop(data) {
        const ctrl = data.target;

        if (ctrl.userData.handedness === 'left') {
            this.onLeftAxisStop(ctrl);
        } else if (ctrl.userData.handedness === 'right') {
            this.onRightAxisStop(ctrl);
        }
    }

    // Right axis stops.
    onRightAxisStop() {
        // No operation defined.
    }

    // Left axis stops.
    onLeftAxisStop() {
        // No operation defined.
    }

    // Button released.
    onButtonReleased(data) {
        const ctrl = data.target;

        if (ctrl.userData.handedness === 'left') {
            this.onLeftButtonReleased(ctrl);
        } else if (ctrl.userData.handedness === 'right') {
            this.onRightButtonReleased(ctrl);
        }
    }
    // Right button released.
    onRightButtonReleased() {
        this.rightButtonPressed = false;
    }

    // Left button released.
    onLeftButtonReleased() {
    // No operation defined.
    }
}

export default VRControls;

