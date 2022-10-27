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
//      Weighted, Blended, 2013 (fastest, approximate, mobile friendly)
//
//  THREE Issue:
//      https://github.com/mrdoob/three.js/issues/9977
//
//  More:
//      https://stackoverflow.com/questions/38892933/order-independent-transparency-and-mixed-opaque-and-translucent-object-hierarchi
//      https://github.com/ingun37/threejs-depth-peeling-demo
//
/////////////////////////////////////////////////////////////////////////////////////
//
//  TODO:
//      - Support Built-In Shaders (look at that closed demo by some guy)
//      - Better demo
//      - Develop as Pass? Need to enable/disable opaque/transparent objects
//

import * as THREE from 'three';

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

        // McGuire, 03/2015
        float w = clamp( pow( ( color.a * 8.0 + 0.01 ) * ( - gl_FragCoord.z * 0.95 + 1.0 ), 3.0 ) * 1e3, 1e-2, 3e2 );
        vec4 accum = vec4( color.rgb, color.a ) * w;

        gl_FragColor = clamp( accum, 1e-2, 1.0 - 1e-2 );
    }
`;

const fragmentShaderRevealage = `
    precision highp float;
    precision highp int;

    varying vec4 vColor;

    void main() {
        vec4 color = vColor;

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

        gl_FragColor = clamp( vec4( accum.rgb / clamp( accum.a, 1e-4, 5e4 ), reveal ), 0.001, 0.999 );
    }
`;

/////////////////////////////////////////////////////////////////////////////////////
/////   Order Independent Transparency
/////////////////////////////////////////////////////////////////////////////////////

/** Weighted, Blended Order-Independent Transparency Renderer */
class WboitRenderer {

    constructor ( renderer ) {

        const self = this;

        // Materials

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

        // Render Targets

        const baseTarget = new THREE.WebGLRenderTarget( window.innerWidth, window.innerHeight, {
            minFilter: THREE.NearestFilter,
            magFilter: THREE.NearestFilter,
            type: THREE.FloatType,
            format: THREE.RGBAFormat,
            stencilBuffer: false,
            depthBuffer: true,
        } );

        const opaqueTarget = new THREE.WebGLRenderTarget( window.innerWidth, window.innerHeight, {
            minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter,
            type: THREE.FloatType, format: THREE.RGBAFormat, stencilBuffer: false, depthBuffer: false,
        } );

        const accumulationTarget = new THREE.WebGLRenderTarget( window.innerWidth, window.innerHeight, {
            minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter,
            type: THREE.FloatType, format: THREE.RGBAFormat, stencilBuffer: false, depthBuffer: false,
        } );

        const revealageTarget = new THREE.WebGLRenderTarget( window.innerWidth, window.innerHeight, {
            minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter,
            type: THREE.FloatType, format: THREE.RGBAFormat, stencilBuffer: false, depthBuffer: false,
        } );

        // Full Screen Quads

        const quadCamera = new THREE.OrthographicCamera( - 1, 1, 1, - 1, 0, 1 );
        const quadGeometry = new THREE.BufferGeometry();
        quadGeometry.setAttribute( 'position', new THREE.Float32BufferAttribute( [ - 1, 3, 0, - 1, - 1, 0, 3, - 1, 0 ], 3 ) );
        quadGeometry.setAttribute( 'uv', new THREE.Float32BufferAttribute( [ 0, 2, 0, 0, 2, 0 ], 2 ) );

        const blendQuad = new THREE.Mesh( quadGeometry.clone(), blendMaterial );
        const copyQuad = new THREE.Mesh( quadGeometry.clone(), copyMaterial );
        const compositingQuad = new THREE.Mesh( quadGeometry.clone(), compositingMaterial );

        // Events

        function onWindowResize() {
            if ( self.enabled === true ) {
                baseTarget.setSize( window.innerWidth, window.innerHeight );
                opaqueTarget.setSize( window.innerWidth, window.innerHeight );
                accumulationTarget.setSize( window.innerWidth, window.innerHeight );
                revealageTarget.setSize( window.innerWidth, window.innerHeight );
            }
        }

        window.addEventListener( 'resize', onWindowResize, false );

        // Visibility

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

        // OnBeforeCompile

        function extendShaders( scene, camera ) {
            if ( ! scene ) return;

            let changedMaterials = false;
            scene.traverse( ( object ) => {
                if ( object.material ) {
                    let materials = Array.isArray( object.material ) ? object.material : [ object.material ];

                    for (let i = 0; i < materials.length; i ++ ) {
                        let material = materials[i];

                        if (material._wboitEnabled !== true) {

                            console.log( material );

                            const existingOnBeforeCompile = material.onBeforeCompile;
                            material.onBeforeCompile = function( shader, renderer ) {
                                if (typeof existingOnBeforeCompile === 'function') existingOnBeforeCompile( shader, renderer );

                                shader.fragmentShader = shader.fragmentShader.replace( /}$/gm, `
                                        gl_FragColor = vec4( 1.0, 1.0, 1.0, 1.0 );
                                    }
                                `);

                                console.log( shader.fragmentShader );
                            }

                            material.needsUpdate = true;
                            material._wboitEnabled = true;
                            changedMaterials = true;
                        }
                    }
                }
            } );

            // if ( changedMaterials ) renderer.compile( scene, camera )
        }

        // Render

        const clearColorZero = new THREE.Color( 0.0, 0.0, 0.0 );
        const clearColorOne = new THREE.Color( 1.0, 1.0, 1.0 );

        let currentAutoClear;
        let currentClearAlpha, currentClearColor = new THREE.Color();
        let currentRenderTarget, currentOverrideMaterial;

        function blendTarget( fromTarget, toTarget ) {
            renderer.setRenderTarget( toTarget );
            blendMaterial.uniforms[ 'tDiffuse' ].value = fromTarget.texture;
            renderer.render( blendQuad, quadCamera );
        }

        function copyTarget( fromTarget, toTarget, blend = false ) {
            renderer.setRenderTarget( toTarget );
            copyMaterial.uniforms[ 'tDiffuse' ].value = fromTarget.texture;
            renderer.render( copyQuad, quadCamera );
        }

        function render( scene, camera, writeBuffer = null ) {

            // Save Current State
            currentAutoClear = renderer.autoClear;
            renderer.autoClear = false;
            currentRenderTarget = renderer.getRenderTarget();
            renderer.getClearColor( currentClearColor );
			currentClearAlpha = renderer.getClearAlpha();
            currentOverrideMaterial = scene.overrideMaterial;

            // Verify Extra Shader Content
            extendShaders( scene, camera );

            // Render Opaque Objects
            changeVisible( scene, true, false );
            scene.overrideMaterial = null;
            renderer.setRenderTarget( baseTarget );
            renderer.setClearColor( clearColorZero, 0.0 );
            renderer.clear();
            renderer.render( scene, camera );
            copyTarget( baseTarget, opaqueTarget );
            changeVisible( scene, false, true );

            // Render Transparent Objects, Accumulation Pass
            scene.overrideMaterial = accumulationMaterial;
            renderer.setRenderTarget( baseTarget );
            renderer.setClearColor( clearColorZero, 0.0 );
            renderer.clearColor();
            renderer.render( scene, camera );
            copyTarget( baseTarget, accumulationTarget );

            // Render Transparent Objects, Revealage Pass
            scene.overrideMaterial = revealageMaterial;
            renderer.setRenderTarget( baseTarget );
            renderer.setClearColor( clearColorOne, 1.0 );
            renderer.clearColor();
            renderer.render( scene, camera );
            copyTarget( baseTarget, revealageTarget );

            // Blend Opaque Texture with WriteBuffer
            blendTarget( opaqueTarget, writeBuffer );

            // Composite Transparent Objects
            compositingMaterial.uniforms[ 'tAccumulation' ].value = accumulationTarget.texture;
            compositingMaterial.uniforms[ 'tRevealage' ].value = revealageTarget.texture;
            scene.overrideMaterial = null;
            renderer.setRenderTarget( writeBuffer );
            renderer.render( compositingQuad, quadCamera );

            // Restore Original State
            changeVisible( scene, true, true );
            renderer.setRenderTarget( currentRenderTarget );
            renderer.setClearColor( currentClearColor, currentClearAlpha );
            scene.overrideMaterial = currentOverrideMaterial;
            renderer.autoClear = currentAutoClear;

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