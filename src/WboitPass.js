/** /////////////////////////////////////////////////////////////////////////////////
//
// @description WboitRenderer
// @about       Weighted, blended order-independent transparency renderer for use with three.js WebGLRenderer
// @author      Stephens Nunnally <@stevinz>
// @license     MIT - Copyright (c) 2022 Stephens Nunnally and Scidian Software
// @source      https://github.com/stevinz/three-oit
//
//      See end of file for license details and acknowledgements
//
///////////////////////////////////////////////////////////////////////////////////*/
//
//  Types of Order Independent Transparency
//      Depth Peeling, 2001 (many passes)
//      Dual Depth Peeling, 2008 (many passes)
//      Weighted, Blended, 2013 (fastest, approximate, mobile friendly)
//
//  THREE Issue(s):
//      https://github.com/mrdoob/three.js/issues/9977
//      https://github.com/mrdoob/three.js/pull/24227
//
/////////////////////////////////////////////////////////////////////////////////////
//
//  TODO:
//      - Develop as Pass? Need to enable/disable opaque/transparent objects
//          - Cache for changing visibility
//          - go over render()
//      - Check for WebGL2, if so, use single Accumulation pass (MultipleRenderTargets)
//      - Support Built-In Shaders (look at that closed demo by some guy)
//      - Option to turn transparency on / off
//
/////////////////////////////////////////////////////////////////////////////////////

import * as THREE from 'three';

import { Pass } from 'three/addons/postprocessing/Pass.js';

///// Vertex Shaders

const vertexShaderAccumulation = `
    precision highp float;
    precision highp int;

    attribute vec4 color;

    varying vec4 vColor;
    varying vec2 vUv;

    void main() {
        vColor = color;
        gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
    }
`;

const vertexShaderQuad = `
    varying vec2 vUv;

    void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
    }
`;

///// Fragment Shaders

const fragmentShaderCopy = `
    varying vec2 vUv;

    uniform sampler2D tDiffuse;

    void main() {
        gl_FragColor = texture2D( tDiffuse, vUv );
    }
`;

const fragmentShaderAccumulation = `
    precision highp float;
    precision highp int;

    varying vec4 vColor;

    void main() {
        vec4 color = vColor;
        color.rgb *= color.a;

        // McGuire, 10/2013
        float w = clamp( pow( ( color.a * 8.0 + 0.01 ) * ( - gl_FragCoord.z * 0.95 + 1.0 ), 3.0 ) * 1e3, 1e-2, 3e2 );
        gl_FragColor = vec4( color.rgb, color.a ) * w;
    }
`;

const fragmentShaderRevealage = `
    precision highp float;
    precision highp int;

    varying vec4 vColor;

    void main() {
        vec4 color = vColor;

        // McGuire, 10/2013
        gl_FragColor = vec4( color.a );
    }
`;

const fragmentShaderCompositing = `
    varying vec2 vUv;

    uniform sampler2D tAccumulation;
    uniform sampler2D tRevealage;

    void main() {
        // McGuire, 10/2013
        vec4 accum = texture2D( tAccumulation, vUv );
        float reveal = texture2D( tRevealage, vUv ).r;
        vec4 composite = vec4( accum.rgb / clamp( accum.a, 0.0001, 50000.0 ), reveal );
        gl_FragColor = clamp( composite, 0.01, 0.99 );
    }
`;

///// Local Variables

const _clearColorZero = new THREE.Color( 0.0, 0.0, 0.0 );
const _clearColorOne = new THREE.Color( 1.0, 1.0, 1.0 );

const blendMaterial = new THREE.ShaderMaterial( {
    vertexShader: vertexShaderQuad,
    fragmentShader: fragmentShaderCopy,
    uniforms: {
        "tDiffuse": { value: null },
    },
    depthTest: false,
    depthWrite: false,
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.SrcAlphaFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
} );

const copyMaterial = new THREE.ShaderMaterial( {
    vertexShader: vertexShaderQuad,
    fragmentShader: fragmentShaderCopy,
    uniforms: {
        "tDiffuse": { value: null },
    },
    depthTest: false,
    depthWrite: false,
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.ZeroFactor,
} );

const accumulationMaterial = new THREE.ShaderMaterial( {
    vertexShader: vertexShaderAccumulation,
    fragmentShader: fragmentShaderAccumulation,
    uniforms: {
        "tOpaque": { value: null },
    },
    side: THREE.DoubleSide,
    depthWrite: false,
    depthTest: true,
    transparent: true,
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneFactor,
} );

const revealageMaterial = new THREE.ShaderMaterial( {
    vertexShader: vertexShaderAccumulation,
    fragmentShader: fragmentShaderRevealage,
    uniforms: {
        "tOpaque": { value: null },
    },
    side: THREE.DoubleSide,
    depthWrite: false,
    depthTest: true,
    transparent: true,
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.ZeroFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
} );

const compositingMaterial = new THREE.ShaderMaterial( {
    vertexShader: vertexShaderQuad,
    fragmentShader: fragmentShaderCompositing,
    uniforms: {
        "tAccumulation": { value: null },
        "tRevealage": { value: null },
    },
    transparent: true,
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneMinusSrcAlphaFactor,
    blendDst: THREE.SrcAlphaFactor,
} );

const quadCamera = new THREE.OrthographicCamera( - 1, 1, 1, - 1, 0, 1 );
const quadGeometry = new THREE.BufferGeometry();
quadGeometry.setAttribute( 'position', new THREE.Float32BufferAttribute( [ - 1, 3, 0, - 1, - 1, 0, 3, - 1, 0 ], 3 ) );
quadGeometry.setAttribute( 'uv', new THREE.Float32BufferAttribute( [ 0, 2, 0, 0, 2, 0 ], 2 ) );

const blendQuad = new THREE.Mesh( quadGeometry.clone(), blendMaterial );
const copyQuad = new THREE.Mesh( quadGeometry.clone(), copyMaterial );
const compositingQuad = new THREE.Mesh( quadGeometry.clone(), compositingMaterial );

/////////////////////////////////////////////////////////////////////////////////////
/////   Weighted, Blended Order-Independent Transparency
/////////////////////////////////////////////////////////////////////////////////////

class WboitPass extends Pass {

    constructor ( scene, camera, renderer ) {

        super();

        this.scene = scene;
		this.camera = camera;

		this.clear = false;
		this.clearDepth = false;
		this.needsSwap = false;

        // Intrenal

		this._oldClearColor = new THREE.Color();

        // Render Targets

        const size = renderer.getSize( new THREE.Vector2() );
        const pixelRatio = renderer.getPixelRatio();
        const effectiveWidth = size.width * pixelRatio;
        const effectiveHeight = size.height * pixelRatio;

        this.baseTarget = new THREE.WebGLRenderTarget( effectiveWidth, effectiveHeight, {
            minFilter: THREE.NearestFilter,
            magFilter: THREE.NearestFilter,
            type: THREE.FloatType,
            format: THREE.RGBAFormat,
            stencilBuffer: false,
            depthBuffer: true,
        } );

        this.opaqueTarget = new THREE.WebGLRenderTarget( effectiveWidth, effectiveHeight, {
            minFilter: THREE.NearestFilter,
            magFilter: THREE.NearestFilter,
            type: THREE.FloatType,
            format: THREE.RGBAFormat,
            stencilBuffer: false,
            depthBuffer: false,
        } );

        this.accumulationTarget = new THREE.WebGLRenderTarget( effectiveWidth, effectiveHeight, {
            minFilter: THREE.NearestFilter,
            magFilter: THREE.NearestFilter,
            type: THREE.FloatType,
            format: THREE.RGBAFormat,
            stencilBuffer: false,
            depthBuffer: false,
        } );

        this.revealageTarget = new THREE.WebGLRenderTarget( effectiveWidth, effectiveHeight, {
            minFilter: THREE.NearestFilter,
            magFilter: THREE.NearestFilter,
            type: THREE.FloatType,
            format: THREE.RGBAFormat,
            stencilBuffer: false,
            depthBuffer: false,
        } );

    }

    dispose() {

        this.baseTarget.dispose();
        this.opaqueTarget.dispose();
        this.accumulationTarget.dispose();
        this.revealageTarget.dispose();

    }

    setSide( side ) {

        revealageMaterial.side = side;
        accumulationMaterial.side = side;

    }

    setSize( width, height ) {

        this.baseTarget.setSize( width, height );
        this.opaqueTarget.setSize( width, height );
        this.accumulationTarget.setSize( width, height );
        this.revealageTarget.setSize( width, height );

    }

    render( renderer, writeBuffer = null, readBuffer = null /*, deltaTime, maskActive */ ) {

        if ( ! this.scene || ! this.scene.isScene ) return;

        function changeVisible( scene, opaqueVisible = true, transparentVisible = true ) {
            if ( ! scene ) return;
            scene.traverse( ( object ) => {
                if ( object.material ) {
                    if ( object.material.transparent === true ) {
                        object.visible = transparentVisible;
                    } else {
                        object.visible = opaqueVisible;
                    }
                }
            } );
        }

        function blendTarget( fromTarget, toTarget ) {
            renderer.setRenderTarget( toTarget );
            blendMaterial.uniforms[ 'tDiffuse' ].value = fromTarget.texture;
            renderer.render( blendQuad, quadCamera );
        }

        function copyTarget( fromTarget, toTarget ) {
            renderer.setRenderTarget( toTarget );
            copyMaterial.uniforms[ 'tDiffuse' ].value = fromTarget.texture;
            renderer.render( copyQuad, quadCamera );
        }

        // Save Current State
        const oldAutoClear = renderer.autoClear;;
        const oldClearAlpha = renderer.getClearAlpha();
        const oldRenderTarget = renderer.getRenderTarget();
        const oldOverrideMaterial = this.scene.overrideMaterial;
        renderer.autoClear = false;
        renderer.getClearColor( this._oldClearColor );

        // Render Opaque Objects
        changeVisible( this.scene, true, false );
        this.scene.overrideMaterial = null;
        renderer.setRenderTarget( this.baseTarget );
        renderer.setClearColor( _clearColorZero, 0.0 );
        renderer.clear();
        renderer.render( this.scene, this.camera );
        copyTarget( this.baseTarget, this.opaqueTarget );
        changeVisible( this.scene, false, true );

        // Render Transparent Objects, Accumulation Pass
        this.scene.overrideMaterial = accumulationMaterial;
        renderer.setRenderTarget( this.baseTarget );
        renderer.setClearColor( _clearColorZero, 0.0 );
        renderer.clearColor();
        renderer.render( this.scene, this.camera );
        copyTarget( this.baseTarget, this.accumulationTarget );

        // Render Transparent Objects, Revealage Pass
        this.scene.overrideMaterial = revealageMaterial;
        renderer.setRenderTarget( this.baseTarget );
        renderer.setClearColor( _clearColorOne, 1.0 );
        renderer.clearColor();
        renderer.render( this.scene, this.camera );
        copyTarget( this.baseTarget, this.revealageTarget );

        // Blend Opaque Texture with WriteBuffer
        blendTarget( this.opaqueTarget, writeBuffer );

        // Composite Transparent Objects
        compositingMaterial.uniforms[ 'tAccumulation' ].value = this.accumulationTarget.texture;
        compositingMaterial.uniforms[ 'tRevealage' ].value = this.revealageTarget.texture;
        this.scene.overrideMaterial = null;
        renderer.setRenderTarget( writeBuffer );
        renderer.render( compositingQuad, quadCamera );

        // Restore Original State
        changeVisible( this.scene, true, true );
        renderer.setRenderTarget( oldRenderTarget );
        renderer.setClearColor( this._oldClearColor, oldClearAlpha );
        this.scene.overrideMaterial = oldOverrideMaterial;
        renderer.autoClear = oldAutoClear;

    }

}

/////////////////////////////////////////////////////////////////////////////////////
/////   Exports
/////////////////////////////////////////////////////////////////////////////////////

export { WboitPass };

/////////////////////////////////////////////////////////////////////////////////////
/////   Reference
/////////////////////////////////////////////////////////////////////////////////////
//
// Basic OIT Info:
//      https://learnopengl.com/Guest-Articles/2020/OIT/Introduction
//      https://en.wikipedia.org/wiki/Order-independent_transparency
//
// Multiple Render Targets:
//      https://github.com/mrdoob/three.js/blob/master/examples/webgl2_multiple_rendertargets.html
//
/////////////////////////////////////////////////////////////////////////////////////
/////   Acknowledgements
/////////////////////////////////////////////////////////////////////////////////////
//
// Original Paper on WBOIT:
//      Description:    Weighted, Blended Order-Independent Transparency
//      Author:         Morgan McGuire and Louis Bavoil
//      License:        CC BYND 3.0
//      Source(s):      http://jcgt.org/published/0002/02/09/
//                      http://casual-effects.blogspot.com/2014/03/weighted-blended-order-independent.html
//                      http://casual-effects.blogspot.com/2015/03/implemented-weighted-blended-order.html
//                      http://casual-effects.blogspot.com/2015/03/colored-blended-order-independent.html
//                      http://casual-effects.com/research/McGuire2016Transparency/index.html
//
// Working WebGL 2 Example:
//      Description:    WebGL 2 Example: Weighted, Blended Order-independent Transparency
//      Author:         Tarek Sherif <@tsherif>
//      License:        Distributed under the MIT License
//      Source:         https://github.com/tsherif/webgl2examples/blob/master/oit.html
//
// Previous Three.js Progress:
//      Description:    Depth Peel Example
//      Author:         Dusan Bosnjak <@pailhead>
//      Source:         https://github.com/mrdoob/three.js/pull/15490
//                      https://raw.githack.com/pailhead/three.js/depth-peel-stencil/examples/webgl_materials_depthpeel.html
//
//      Description:    Weighted, Blended Example
//      Author:         Alexander Rose <@arose>
//      Source(s):      https://github.com/mrdoob/three.js/issues/4814
//                      https://github.com/arose/three.js/tree/oit
//                      https://github.com/mrdoob/three.js/compare/dev...arose:three.js:oit
//                      https://raw.githack.com/arose/three.js/oit/examples/webgl_oit.html
//
/////////////////////////////////////////////////////////////////////////////////////
/////   License
/////////////////////////////////////////////////////////////////////////////////////
//
// MIT License
//
// three-oit
//      Copyright (c) 2022 Stephens Nunnally <@stevinz>
//
// Some Portions
//      Copyright (c) 2010-2022 mrdoob and three.js authors
//      Copyright (c) 2014 Alexander Rose
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.
