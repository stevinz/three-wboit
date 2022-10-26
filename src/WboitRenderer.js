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
//  THREE Issue:
//      https://github.com/mrdoob/three.js/issues/9977
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

const fragmentShaderModulate = `
    varying vec4 vColor;
    varying vec2 vUv;

    uniform sampler2D tOpaque;

    void main() {
        vec4 color = vColor;                            // Final lit rgba color of transparent object to draw
        vec4 transmit = texture2D( tOpaque, vUv );      // Current pixel color from opaque render

        gl_FragColor = vec4( color.a * ( vec3( 1.0 ) - transmit.rgb ), transmit.a );
    }
;`

const fragmentShaderAccumulation = `
    precision highp float;
    precision highp int;

    varying vec4 vColor;

    // McGuire, 03/2015
    float weight(float z, float a) {
        return clamp( pow( ( a * 8.0 + 0.01 ) * ( - z * 0.95 + 1.0 ), 3.0 ) * 1e3, 1e-2, 3e2 );
    }

    void main() {
        vec4 color = vColor;                // Final lit rgba color of transparent object to draw
        vec4 transmit = vec4( 0.0 );        // TODO: Input color of pixel from full scene opaque object render
        color.rgb *= color.a;               // EnsurePremultiplied

        /* ---------- */
        /* TODO: Modulate, i.e. overwrite existing opaque object render */
        // gl_FragColor(opaqueTexture) = vec4( color.a * ( vec3( 1.0 ) - transmit.rgb ), transmit.a );
        // color.a *= 1.0 - ( ( transmit.r + transmit.g + transmit.b ) * ( 1.0 / 3.0 ) );
        /* ---------- */

        gl_FragColor = vec4( color.rgb, color.a ) * weight( gl_FragCoord.z, color.a );
    }
`;

const fragmentShaderRevealage = `
    precision highp float;
    precision highp int;

    varying vec4 vColor;
    varying vec2 vUv;

    void main() {
        vec4 color = vColor;                // Final lit rgba color of transparent object to draw
        vec4 transmit = vec4( 0.0 );        // TODO: Input color of pixel from full scene opaque object render

        /* ---------- */
        /* TODO: Modulate, i.e. overwrite existing opaque object render */
        // color.a *= 1.0 - ( ( transmit.r + transmit.g + transmit.b ) * ( 1.0 / 3.0 ) );
        /* ---------- */

        gl_FragColor = vec4( color.a );
    }
`;

const fragmentShaderCompositing = `
    varying vec2 vUv;

    uniform sampler2D tAccumulation;
    uniform sampler2D tRevealage;

    void main() {
        vec4 accum = texture2D( tAccumulation, vUv );
        float reveal = texture2D( tRevealage, vUv ).r;
        gl_FragColor = vec4( accum.rgb / clamp( accum.a, 1e-4, 5e4 ), reveal );
    }
`;

const fragmentShaderFinal = `
    varying vec2 vUv;

    uniform sampler2D tOpaque;
    uniform sampler2D tTransparent;

    void main() {
        vec4 opaque = texture2D( tOpaque, vUv );
        vec4 trans = texture2D( tTransparent, vUv );

        gl_FragColor = opaque + trans;
    }
`;

/////////////////////////////////////////////////////////////////////////////////////
/////   Order Independent Transparency
/////////////////////////////////////////////////////////////////////////////////////

/** Weighted, Blended Order-Independent Transparency Renderer */
class WboitRenderer {

    constructor ( renderer ) {

        // Materials

        const modulateMaterial = new THREE.ShaderMaterial({

        });

        const accumulationMaterial = new THREE.ShaderMaterial({
            vertexShader: vertexShaderAccumulation,
            fragmentShader: fragmentShaderAccumulation,
            side: THREE.DoubleSide,
            depthWrite: false,
            depthTest: true,
            transparent: true,
            blending: THREE.CustomBlending,
            blendEquation: THREE.AddEquation,
            blendSrc: THREE.OneFactor,
            blendDst: THREE.OneFactor,
        });

        const revealageMaterial = new THREE.ShaderMaterial({
            vertexShader: vertexShaderAccumulation,
            fragmentShader: fragmentShaderRevealage,
            side: THREE.DoubleSide,
            depthWrite: false,
            depthTest: true,
            transparent: true,
            blending: THREE.CustomBlending,
            blendEquation: THREE.AddEquation,
            blendSrc: THREE.ZeroFactor,
            blendDst: THREE.OneMinusSrcAlphaFactor,
        });

        const compositingMaterial = new THREE.ShaderMaterial({
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
        });

        const finalMaterial = new THREE.ShaderMaterial({
            vertexShader: vertexShaderQuad,
            fragmentShader: fragmentShaderFinal,
            uniforms: {
                "tOpaque": { value: null },
                "tTransparent": { value: null },
            },
            transparent: true,
            blending: THREE.CustomBlending,
            blendEquation: THREE.AddEquation,
            blendSrc: THREE.OneFactor,
            blendDst: THREE.OneFactor,
        });

        // Render Targets

        const opaqueTarget = new THREE.WebGLRenderTarget( window.innerWidth, window.innerHeight, {
            minFilter: THREE.NearestFilter,
            magFilter: THREE.NearestFilter,
            type: THREE.FloatType,
            format: THREE.RGBAFormat,
            stencilBuffer: false,
        });
        opaqueTarget.depthTexture = new THREE.DepthTexture();
        // opaqueTarget.depthTexture.format = THREE.DepthFormat;
        // opaqueTarget.depthTexture.type = THREE.UnsignedShortType;

        const accumulationTarget = new THREE.WebGLRenderTarget( window.innerWidth, window.innerHeight, {
            minFilter: THREE.NearestFilter,
            magFilter: THREE.NearestFilter,
            type: THREE.FloatType,
            format: THREE.RGBAFormat,
            stencilBuffer: false,
            depthBuffer: false,
        });

        const revealageTarget = new THREE.WebGLRenderTarget( window.innerWidth, window.innerHeight, {
            minFilter: THREE.NearestFilter,
            magFilter: THREE.NearestFilter,
            type: THREE.FloatType,
            format: THREE.RGBAFormat,
            stencilBuffer: false,
            depthBuffer: false,
        });

        const compositingTarget = new THREE.WebGLRenderTarget( window.innerWidth, window.innerHeight, {
            minFilter: THREE.NearestFilter,
            magFilter: THREE.NearestFilter,
            type: THREE.FloatType,
            format: THREE.RGBAFormat,
            stencilBuffer: false,
            depthBuffer: false,
        });

        // Full Screen Quad

        const quadCamera = new THREE.OrthographicCamera( - 1, 1, 1, - 1, 0, 1 );
        const quadGeometry = new THREE.BufferGeometry();
        quadGeometry.setAttribute( 'position', new THREE.Float32BufferAttribute( [ - 1, 3, 0, - 1, - 1, 0, 3, - 1, 0 ], 3 ) );
        quadGeometry.setAttribute( 'uv', new THREE.Float32BufferAttribute( [ 0, 2, 0, 0, 2, 0 ], 2 ) );
        const compositingQuad = new THREE.Mesh( quadGeometry, compositingMaterial );
        const finalQuad = new THREE.Mesh( quadGeometry, finalMaterial );

        // Events

        function onWindowResize() {
            opaqueTarget.setSize( window.innerWidth, window.innerHeight );
            accumulationTarget.setSize( window.innerWidth, window.innerHeight );
            revealageTarget.setSize( window.innerWidth, window.innerHeight );
            compositingTarget.setSize( window.innerWidth, window.innerHeight );
            render();
        }

        window.addEventListener( 'resize', onWindowResize, false );

        // Visibility

        function changeVisible( scene, opaqueVisible = true, transparentVisible = true ) {
            scene.traverse( ( object ) => {
                if ( object.material ) {
                    if ( object.material.transparent === true ) {
                        object.visible = transparentVisible;
                    } else {
                        object.visible = opaqueVisible;
                    }
                }
            });
        }

        // Render

        const clearColorZero = new THREE.Color( 0.0, 0.0, 0.0 );
        const clearColorOne = new THREE.Color( 1.0, 1.0, 1.0 );

        let currentClearAlpha;
        let currentClearColor = new THREE.Color();
        let currentRenderTarget;
        let currentOverrideMaterial;

        function render( scene, camera, writeBuffer = null ) {

            // Save Current State
            currentRenderTarget = renderer.getRenderTarget();
            renderer.getClearColor( currentClearColor );
			currentClearAlpha = renderer.getClearAlpha();
            currentOverrideMaterial = scene.overrideMaterial;

            // Render Opaque Objects
            changeVisible( scene, true, false );
            scene.overrideMaterial = null;
            renderer.setRenderTarget( opaqueTarget );
            renderer.setClearColor( clearColorZero, 0.0 );
            renderer.clear(/* all */);
            renderer.render( scene, camera );

            // Modulate Opaque Pixels
            //
            // TODO
            //

            // Render Transparent Objects, Accumulation Pass
            changeVisible( scene, false, true );
            scene.overrideMaterial = accumulationMaterial;
            renderer.setRenderTarget( accumulationTarget );
            renderer.setClearColor( clearColorZero, 0.0 );
            renderer.clearColor();
            renderer.render( scene, camera );

            // Render Transparent Objects, Revealage Pass
            scene.overrideMaterial = revealageMaterial;
            renderer.setRenderTarget( revealageTarget );
            renderer.setClearColor( clearColorOne, 1.0 );
            renderer.clearColor();
            renderer.render( scene, camera );

            // Composite Transparent Objects
            compositingMaterial.uniforms[ 'tAccumulation' ].value = accumulationTarget.texture;
            compositingMaterial.uniforms[ 'tRevealage' ].value = revealageTarget.texture;
            scene.overrideMaterial = null;
            renderer.setRenderTarget( compositingTarget );
            renderer.setClearColor( clearColorZero, 0.0 );
            renderer.clear();
            renderer.render( compositingQuad, quadCamera );

            // Final Output, Combine Opaque / Transparent
            finalMaterial.uniforms[ 'tOpaque' ].value = opaqueTarget.texture;
            finalMaterial.uniforms[ 'tTransparent' ].value = compositingTarget.texture;
            renderer.setRenderTarget( writeBuffer );
            renderer.render( finalQuad, quadCamera );

            // Restore Original State
            changeVisible( scene, true, true );
            renderer.setRenderTarget( currentRenderTarget );
            renderer.setClearColor( currentClearColor, currentClearAlpha );
            scene.overrideMaterial = currentOverrideMaterial;

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
//      License:        CC BYND 3.0
//      Source(s):      http://jcgt.org/published/0002/02/09/
//                      http://casual-effects.blogspot.com/2015/03/implemented-weighted-blended-order.html
//                      http://casual-effects.blogspot.com/2015/03/colored-blended-order-independent.html
//                      http://casual-effects.com/research/McGuire2016Transparency/index.html
//
// Working WebGL 2 WBOIT Example:
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
