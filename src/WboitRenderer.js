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
//      Depth Peeling, 2001 (many passes, slowest)
//      Dual Depth Peeling, 2008 (many passes)
//      Weighted, Blended, 2013 (fastest, approximate)
//
//  THREE Issues
//      Issue: Order Independent Transparency
//          https://github.com/mrdoob/three.js/issues/9977
//
//  Implemented WebGL
//      https://github.com/tsherif/webgl2examples/blob/master/oit.html
//
/////////////////////////////////////////////////////////////////////////////////////

import * as THREE from 'three';

///// Shaders

const vertexShaderAccumulation = `
    precision highp float;
    precision highp int;

    uniform mat4 modelViewMatrix;
    uniform mat4 projectionMatrix;

    attribute vec3 position;
    attribute vec4 color;

    varying vec4 vColor;

    void main() {
        vColor = color;
        gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
    }
`;

const fragmentShaderAccumulation = `
    precision highp float;
    precision highp int;

    varying vec4 vColor;

    float weight( float z2, float a ) {
        return clamp( pow( min( 1.0, a * 10.0 ) + 0.01, 3.0 ) * 1e8 * pow( 1.0 - z2 * 0.9, 3.0 ), 1e-2, 3e3 );
    }

    void main() {
        vec4 color = vColor;
        color.rgb *= color.a;
        float w = weight( gl_FragCoord.z, color.a );
        gl_FragColor = vec4( color.rgb * w, color.a );
    }
`;

const fragmentShaderRevealage = `
    precision highp float;
    precision highp int;

    varying vec4 vColor;

    float weight( float z2, float a ) {
        return clamp( pow( min( 1.0, a * 10.0 ) + 0.01, 3.0 ) * 1e8 * pow( 1.0 - z2 * 0.9, 3.0 ), 1e-2, 3e3 );
    }

    void main() {
        vec4 color = vColor;
        color.rgb *= color.a;
        float w = weight( gl_FragCoord.z, color.a );
        float accumAlpha = color.a * w;
        gl_FragColor = vec4( vec3( accumAlpha ), 1.0 );
    }
`;

const vertexShaderQuad = `
    varying vec2 vUv;

    void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
    }
`;

const fragmentShaderCompositing = `
    varying vec2 vUv;

    uniform sampler2D tAccumulation;
    uniform sampler2D tRevealage;

    void main() {
        vec4 accum = texture2D( tAccumulation, vUv );
        float a = 1.0 - accum.a;
        accum.a = texture2D( tRevealage, vUv ).r;
        gl_FragColor = vec4( a * accum.rgb / clamp( accum.a, 0.001, 50000.0), a );
    }
`;

/////////////////////////////////////////////////////////////////////////////////////
/////   Order Independent Transparency
/////////////////////////////////////////////////////////////////////////////////////

/** Weighted, Blended Order-Independent Transparency Renderer */
class WboitRenderer {

    constructor ( renderer ) {

        // accumulation shader

        const accumulationMaterial = new THREE.RawShaderMaterial(
            {
                vertexShader: vertexShaderAccumulation,
                fragmentShader: fragmentShaderAccumulation,
                side: THREE.DoubleSide,
                depthWrite: false,
                depthTest: false,
                transparent: true,
                blending: THREE.CustomBlending,
                blendEquation: THREE.AddEquation,
                blendSrc: THREE.OneFactor,
                blendDst: THREE.OneFactor
            }
        );

        const revealageMaterial = new THREE.RawShaderMaterial(
            {
                vertexShader: vertexShaderAccumulation,
                fragmentShader: fragmentShaderRevealage,
                side: THREE.DoubleSide,
                depthWrite: false,
                depthTest: false,
                transparent: true,
                blending: THREE.CustomBlending,
                blendEquation: THREE.AddEquation,
                blendSrc: THREE.ZeroFactor,
                blendDst: THREE.OneMinusSrcColorFactor
            }
        );

        // render targets

        const accumulationTexture = new THREE.WebGLRenderTarget(
            window.innerWidth,
            window.innerHeight,
            {
                minFilter: THREE.NearestFilter,
                magFilter: THREE.NearestFilter,
                type: THREE.FloatType,
                format: THREE.RGBAFormat,
                stencilBuffer: false,
            }
        );

        const revealageTexture = new THREE.WebGLRenderTarget(
            window.innerWidth,
            window.innerHeight,
            {
                minFilter: THREE.NearestFilter,
                magFilter: THREE.NearestFilter,
                type: THREE.FloatType,
                format: THREE.RGBAFormat,
                stencilBuffer: false,
            }
        );

        // compositing shader

        const compositingUniforms = {
            "tAccumulation": { value: null },
            "tRevealage": { value: null }
        };

        const compositingMaterial = new THREE.ShaderMaterial(
            {
                vertexShader: vertexShaderQuad,
                fragmentShader: fragmentShaderCompositing,
                uniforms: compositingUniforms,
                transparent: true,
                blending: THREE.CustomBlending,
                blendEquation: THREE.AddEquation,
                blendSrc: THREE.OneFactor,
                blendDst: THREE.OneMinusSrcAlphaFactor,
            }
        );

        const quadCamera = new THREE.OrthographicCamera( - 1, 1, 1, - 1, 0, 1 );

        const quadGeometry = new THREE.BufferGeometry();
        quadGeometry.setAttribute( 'position', new THREE.Float32BufferAttribute( [ - 1, 3, 0, - 1, - 1, 0, 3, - 1, 0 ], 3 ) );
        quadGeometry.setAttribute( 'uv', new THREE.Float32BufferAttribute( [ 0, 2, 0, 0, 2, 0 ], 2 ) );

        const quadMesh = new THREE.Mesh( quadGeometry, compositingMaterial );

        // events

        function onWindowResize() {

            accumulationTexture.setSize( window.innerWidth, window.innerHeight );
            revealageTexture.setSize( window.innerWidth, window.innerHeight );

            render();

        }

        window.addEventListener( 'resize', onWindowResize, false );

        // background color

        const clearColorZero = new THREE.Color( 0, 0, 0 );
        const clearColorOne = new THREE.Color( 1, 1, 1 );

        // render

        function render( scene, camera ) {

            renderer.setClearColor( clearColorZero, 0.1 );
            renderer.clearColor();

            scene.overrideMaterial = accumulationMaterial;
            renderer.setRenderTarget( accumulationTexture );
            renderer.render( scene, camera );

            scene.overrideMaterial = revealageMaterial;
            renderer.setRenderTarget( revealageTexture );
            renderer.render( scene, camera );

            renderer.clearColor();

            compositingUniforms[ 'tAccumulation' ].value = accumulationTexture.texture;
            compositingUniforms[ 'tRevealage' ].value = revealageTexture.texture;
            scene.overrideMaterial = null;
            renderer.setRenderTarget( null );
            renderer.render( quadMesh, quadCamera );

        }

        this.render = render;

    }

}

/////////////////////////////////////////////////////////////////////////////////////
/////   Exports
/////////////////////////////////////////////////////////////////////////////////////

export { WboitRenderer };

/////////////////////////////////////////////////////////////////////////////////////
/////   Reference
/////////////////////////////////////////////////////////////////////////////////////
//
// Intro
//      https://learnopengl.com/Guest-Articles/2020/OIT/Introduction
//
/////////////////////////////////////////////////////////////////////////////////////
/////   Acknowledgements
/////////////////////////////////////////////////////////////////////////////////////
//
// Original Paper on WBOIT:
//      Description:    Weighted, Blended Order-Independent Transparency
//      Author:         Morgan McGuire and Louis Bavoil
//      Source(s):      http://jcgt.org/published/0002/02/09/
//                      http://casual-effects.blogspot.com/2015/03/implemented-weighted-blended-order.html
//
// Working WebGL 2 WBOIT:
//      Description:    WebGL 2 Example: Order-independent Transparency
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
//      Description:    WBOIT Example
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
//      Copyright (c) 2017 Tarek Sherif
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
