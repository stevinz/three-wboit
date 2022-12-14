//
//
//
//
//
import * as THREE from 'three';

import { EffectComposer } from 'three/addons/postprocessing/EffectComposer';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass';
import { OrbitControls } from 'three/addons/controls/OrbitControls';
import { WboitPass, WboitUtils } from 'three-wboit';
import { TextureAtlas } from './texture.js';
import { BoxGeometry } from 'three';
import { MeshBasicMaterial } from 'three';
import { Mesh } from 'three';
import { Scene } from 'three';
import { PerspectiveCamera } from 'three';
import { WebGLRenderer } from 'three';
import { GUI } from 'three/addons/libs/lil-gui.module.min.js';
import { CopyShader } from 'three/addons/shaders/CopyShader.js';
import { GammaCorrectionShader } from 'three/addons/shaders/GammaCorrectionShader.js';
import { sRGBShader } from 'three-wboit';

    let mouse = new THREE.Vector2();
    let pixelBuffer = new Uint8Array( 4 );

    const gui = new GUI();

    const params = {
        opacity: 0.5,
    }

    const canvas = document.getElementById('main');

    const scene = new Scene();

    const camera = new PerspectiveCamera( 75, window.innerWidth / window.innerHeight, 0.1, 1000 );
    camera.position.set(0, 0, 5);
    camera.lookAt(0, 0, 0);

    const renderer = new WebGLRenderer({ canvas: canvas });
    renderer.setPixelRatio(window.devicePixelRatio);

    let gl = renderer.getContext();

    const composer = new EffectComposer(renderer);
    const wboitPass = new WboitPass(renderer, scene, camera, new THREE.Color());
    composer.addPass(wboitPass);
    composer.addPass(new ShaderPass(sRGBShader /* GammaCorrectionShader */));

    new THREE.TextureLoader().load('./leaves_oak.png', (texture) => {
        const atlas = TextureAtlas.createSingle('test', texture, {
            dimension: 16,
        });

        const geometry = new BoxGeometry(1, 1, 1);
        const material1 = new MeshBasicMaterial({
            map: atlas.texture,
            transparent: true,
            alphaTest: 0.1,
        });

        WboitUtils.patch(material1);

        const mesh1 = new Mesh(geometry, material1);
        mesh1.position.set(1, 0, 0);

        const material2 = new MeshBasicMaterial({
            map: atlas.texture,
            transparent: true,
            alphaTest: 0.1,
        });

        const mesh2 = new Mesh(geometry, material2);
        mesh2.position.set(-1, 0, 0);

        const folder1 = gui.addFolder( 'Wboit Params' );
            folder1.add( params, 'opacity', 0, 1 ).onFinishChange( () => {
            material1.opacity = params.opacity;
            material2.opacity = params.opacity;
        } );

        scene.add(mesh1, mesh2);
    });

    const resize = () => {
        const width = window.innerWidth;
        const height = window.innerHeight;
        renderer.setSize(width, height);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        composer.setSize(width, height);
    };

    resize();

    new OrbitControls(camera, renderer.domElement);

    window.addEventListener('resize', resize);
    renderer.domElement.addEventListener( 'mousemove', onMouseMove );

    function onMouseMove( event ) {
        mouse.x = event.clientX;
        mouse.y = event.clientY;
    }

    const animate = () => {
        requestAnimationFrame(animate);
        composer.render();

        // color under mouse

        gl.readPixels( mouse.x, window.innerHeight - mouse.y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixelBuffer );

        const rgba = Array.apply( [], pixelBuffer );
        document.getElementById( 'color' ).innerHTML = [
            ( rgba[ 0 ] / 255 ).toPrecision( 2 ),
            ( rgba[ 1 ] / 255 ).toPrecision( 2 ),
            ( rgba[ 2 ] / 255 ).toPrecision( 2 ),
            ( rgba[ 3 ] / 255 ).toPrecision( 2 )
        ].join( ', ' );

    };

    animate();
