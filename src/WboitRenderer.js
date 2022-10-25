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
//          https://github.com/mrdoob/three.js/pull/15490
//      Dual Depth Peeling, 2008 (many passes)
//      Weighted, Blended, 2013 (fastest, approximate)
//          http://casual-effects.blogspot.com/2014/03/weighted-blended-order-independent.html
//          http://casual-effects.blogspot.com/2015/03/implemented-weighted-blended-order.html
//
//  THREE Issues
//      Issue: Order Independent Transparency
//          https://github.com/mrdoob/three.js/issues/9977
//      First WBOIT (2014) Implementation by @arose
//          https://github.com/mrdoob/three.js/issues/4814
//          https://github.com/mrdoob/three.js/compare/dev...arose:three.js:oit
//      Working
//          https://raw.githack.com/arose/three.js/oit/examples/webgl_oit.html
//
//  Implemented WebGL
//      https://github.com/tsherif/webgl2examples/blob/master/oit.html
//
/////////////////////////////////////////////////////////////////////////////////////

import * as THREE from 'three';

///// Shaders

const vertexShader = `
    precision highp float;
    precision highp int;

    uniform mat4 modelViewMatrix;
    uniform mat4 projectionMatrix;
    uniform mat4 viewMatrix;
    uniform mat4 modelMatrix;

    attribute vec3 position;
    attribute vec4 color;

    varying vec4 vColor;

    varying float z;

    void main() {

        vColor = color;

        gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

        vec4 z4 = modelViewMatrix * vec4( position, 1.0 );
        z = ( z4.xyz / z4.w ).z;
        z = z4.z;

        // z = gl_Position.z;
        // z = position.z;
        // z = ( viewMatrix * vec4( position, 1.0 ) ).z;

    }
`;

const vertexShaderQuad = `
    varying vec2 vUv;

    void main() {

        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

    }
`;

const fragmentShaderQuad = `
    uniform sampler2D tDiffuse;
    uniform float opacity;
    varying vec2 vUv;

    void main() {

        vec4 texel = texture2D( tDiffuse, vUv );
        gl_FragColor = opacity * texel;

    }
`;

const fragmentShaderCompositing = `
    varying vec2 vUv;

    uniform sampler2D tAccumulation;
    uniform sampler2D tRevealage;

    void main()
    {
        vec4 accum = texture2D( tAccumulation, vUv );
        float r = texture2D( tRevealage, vUv ).r;

        gl_FragColor = vec4( accum.rgb / clamp( accum.a, 1e-9, 5e9 ), r );
    }
`;

const fragmentShaderAccumulation = `
    precision highp float;
    precision highp int;

    varying float z;

    varying vec4 vColor;

    float w( float a ) {

        // eq. 10
        // return a * max( 1e-2, 3.0 * 1e3 * pow( 1.0 - gl_FragCoord.z, 3.0 ) );

        // eq. 9
        // return a * clamp( 0.03 / ( 1e-5 + pow( abs( z ) / 200.0, 4.0 ) ), 1e-2, 3e3 );

        // weight function design
        // float colorResistance = 1.0; // 1.0
        // float rangeAdjustmentsClampBounds = 0.3; // 0.3
        // float depth = abs( 1.0 - gl_FragCoord.z ); // abs( z )
        // float orderingDiscrimination = 0.1; // 200.0
        // float orderingStrength = 4.0; // 4.0
        // float minValue = 1e-2;
        // float maxValue = 3e3;
        // return pow( a, colorResistance ) *
        //     clamp(
        //         rangeAdjustmentsClampBounds /
        //             ( 1e-5 + pow( depth / orderingDiscrimination, orderingStrength ) ),
        //         minValue, maxValue
        //     );

        float z2 = z;
        //z2 = gl_FragCoord.z;

        // eq. 7
        return pow( a, 1.0 ) * clamp( 10.0 / ( 1e-5 + pow( abs( z2 ) / 5.0, 1.0 ) + pow( abs( z2 ) / 200.0, 1.0 ) ), 1e-2, 3e3 );

    }

    void main() {

        z; // to silence 'not read' warnings
        float ai = vColor.a;
        vec3 Ci = vColor.rgb * ai;
        gl_FragColor = vec4( Ci, ai ) * w( ai );

    }
`;

const fragmentShaderRevealage = `
    precision highp float;
    precision highp int;

    varying float z;

    varying vec4 vColor;

    float w( float a ) {

        // eq. 10
        // return a * max( 1e-2, 3.0 * 1e3 * pow( 1.0 - gl_FragCoord.z, 3.0 ) );

        // eq. 9
        // return a * clamp( 0.03 / ( 1e-5 + pow( abs( z ) / 200.0, 4.0 ) ), 1e-2, 3e3 );

        // weight function design
        // float colorResistance = 1.0; // 1.0
        // float rangeAdjustmentsClampBounds = 0.3; // 0.3
        // float depth = abs( 1.0 - gl_FragCoord.z ); // abs( z )
        // float orderingDiscrimination = 0.1; // 200.0
        // float orderingStrength = 4.0; // 4.0
        // float minValue = 1e-2;
        // float maxValue = 3e3;
        // return pow( a, colorResistance ) *
        //     clamp(
        //         rangeAdjustmentsClampBounds /
        //             ( 1e-5 + pow( depth / orderingDiscrimination, orderingStrength ) ),
        //         minValue, maxValue
        //     );

        float z2 = z;
        //z2 = gl_FragCoord.z;

        // eq. 7
        return pow( a, 1.0 ) * clamp( 10.0 / ( 1e-5 + pow( abs( z2 ) / 5.0, 1.0 ) + pow( abs( z2 ) / 200.0, 1.0 ) ), 1e-2, 3e3 );

    }

    void main() {

        z; // to silence 'not read' warnings
        float ai = vColor.a;
        gl_FragColor = vec4( vec3( w( ai ) ), 1.0 );

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
                vertexShader: vertexShader,
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

        // revelage shader

        const revealageMaterial = new THREE.RawShaderMaterial(
            {
                vertexShader: vertexShader,
                fragmentShader: fragmentShaderRevealage,
                side: THREE.DoubleSide,
                depthWrite: false,
                depthTest: false,
                transparent: true,
                blending: THREE.CustomBlending,
                blendEquation: THREE.AddEquation,
                blendSrc: THREE.ZeroFactor,
                blendDst: THREE.OneMinusSrcAlphaFactor
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

        const copyUniforms = {
            'tDiffuse': { value: null },
            'opacity': { value: 1.0 }
        };

        const compositingMaterial = new THREE.ShaderMaterial(
            {
                vertexShader: vertexShaderQuad,
                fragmentShader: fragmentShaderCompositing,
                uniforms: compositingUniforms,
                // fragmentShader: fragmentShaderQuad,
                // uniforms: copyUniforms,
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

        function render( scene, camera ) {

            // // Render to Texture
            // scene.overrideMaterial = accumulationMaterial;
            // renderer.setRenderTarget( accumulationTexture );
            // renderer.render( scene, camera );
            // scene.overrideMaterial = null;

            // copyUniforms[ 'tDiffuse' ].value = accumulationTexture.texture;
            // renderer.setRenderTarget( null );
            // renderer.render( quadMesh, quadCamera );
            // return;

            // // Wboit
            renderer.setClearColor( clearColorZero, 1.0 );
            renderer.clearColor();

            scene.overrideMaterial = accumulationMaterial;
            renderer.setRenderTarget( accumulationTexture );
            renderer.render( scene, camera );

            scene.overrideMaterial = revealageMaterial;
            renderer.setRenderTarget( revealageTexture );
            renderer.render( scene, camera );

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
// Some portions of this code adapted from:
//      Description:    WebGL 2 Example: Order-independent Transparency
//      Author:         Tarek Sherif <@tsherif>
//      License:        Distributed under the MIT License
//      Source:         https://github.com/tsherif/webgl2examples/blob/master/oit.html
//
// Thanks to:
//      Description:    Weighted Blended Order-Independent Transparency
//      Author:         Morgan McGuire and Louis Bavoil
//      Source:         http://jcgt.org/published/0002/02/09/
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
