/** /////////////////////////////////////////////////////////////////////////////////
//
// @description WboitRenderer
// @about       Weighted, blended order-independent transparency renderer for use with three.js WebGLRenderer
// @author      Stephens Nunnally <@stevinz>
// @license     MIT - Copyright (c) 2022 Stephens Nunnally and Scidian Software
// @source      https://github.com/stevinz/three-wboit
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

import * as THREE from 'three';

import { Pass } from 'three/addons/postprocessing/Pass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

import { CopyShader } from 'three/addons/shaders/CopyShader.js';
import { WboitCompositeShader } from './shaders/WboitCompositeShader.js';
import { WboitStages } from './materials/MeshWboitMaterial.js';

const _clearColorZero = new THREE.Color( 0.0, 0.0, 0.0 );
const _clearColorOne = new THREE.Color( 1.0, 1.0, 1.0 );

/////////////////////////////////////////////////////////////////////////////////////
/////   Weighted, Blended Order-Independent Transparency
/////////////////////////////////////////////////////////////////////////////////////

class WboitPass extends Pass {

    constructor ( renderer, scene, camera, clearColor, clearAlpha ) {

        if ( ! renderer ) return console.error( `WboitPass.constructor: Renderer must be supplied!` );

        super();

        this.scene = scene;
		this.camera = camera;

        this.clearColor = clearColor;
		this.clearAlpha = ( clearAlpha !== undefined ) ? clearAlpha : 0;

		this.clear = false;
		this.clearDepth = false;
		this.needsSwap = false;

        // Internal

		this._oldClearColor = new THREE.Color();
        this._depthTestCache = new Map();
        this._depthWriteCache = new Map();
        this._visibilityCache = new Map();

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

        this.accumulationTarget = new THREE.WebGLRenderTarget( effectiveWidth, effectiveHeight, {
            minFilter: THREE.NearestFilter,
            magFilter: THREE.NearestFilter,
            type: THREE.FloatType,
            format: THREE.RGBAFormat,
            stencilBuffer: false,
            depthBuffer: false,
        } );

        // Passes

        this.blendPass = new ShaderPass( CopyShader );
        this.blendPass.material.depthTest = false;
        this.blendPass.material.depthWrite = false;
        this.blendPass.material.blending = THREE.CustomBlending;
        this.blendPass.material.blendEquation = THREE.AddEquation;
        this.blendPass.material.blendSrc = THREE.SrcAlphaFactor;
        this.blendPass.material.blendDst = THREE.OneMinusSrcAlphaFactor;

        this.copyPass = new ShaderPass( CopyShader );
        this.copyPass.material.depthTest = false;
        this.copyPass.material.depthWrite = false;
        this.copyPass.material.blending = THREE.CustomBlending;
        this.copyPass.material.blendEquation = THREE.AddEquation;
        this.copyPass.material.blendSrc = THREE.OneFactor;
        this.copyPass.material.blendDst = THREE.ZeroFactor;

        this.compositePass = new ShaderPass( WboitCompositeShader );
        this.compositePass.material.transparent = true;
        this.compositePass.material.blending = THREE.CustomBlending;
        this.compositePass.material.blendEquation = THREE.AddEquation;
        this.compositePass.material.blendSrc = THREE.OneMinusSrcAlphaFactor;
        this.compositePass.material.blendDst = THREE.SrcAlphaFactor;

    }

    dispose() {

        this.baseTarget.dispose();
        this.accumulationTarget.dispose();

        this.blendPass.dispose();
        this.copyPass.dispose();
        this.compositePass.dispose();

    }

    setSize( width, height ) {

        this.baseTarget.setSize( width, height );
        this.accumulationTarget.setSize( width, height );

    }

    render( renderer, writeBuffer = null /* readBuffer = null, deltaTime, maskActive */ ) {

        const scene = this.scene;
        if ( ! scene || ! scene.isScene ) return;

        const cache = this._visibilityCache;
        const testCache = this._depthTestCache;
        const writeCache = this._depthWriteCache;

        const opaqueMeshes = [];
        const transparentMeshes = [];

        function gatherMeshes() {

            scene.traverse( ( object ) => {

                if ( ! object.material ) return;

                let materials = Array.isArray( object.material ) ? object.material : [ object.material ];
                let isWboitCapable = true;

                for ( let i = 0; i < materials.length; i ++ ) {
                    if ( materials[i].isMeshWboitMaterial !== true || materials[i].transparent !== true ) {
                        isWboitCapable = false;
                        break;
                    }
                }

                if ( ! isWboitCapable ) {
                    opaqueMeshes.push( object );
                } else {
                    transparentMeshes.push( object );
                }

                cache.set( object, object.visible );

            } );

        }

        function changeVisible( opaqueVisible = true, transparentVisible = true ) {

            opaqueMeshes.forEach( mesh => mesh.visible = opaqueVisible );
            transparentMeshes.forEach( mesh => mesh.visible = transparentVisible );

        }

        function resetVisible() {

            for ( const [ key, value ] of cache ) key.visible = value;

        }

        function prepareWboitBlending( stage ) {

            transparentMeshes.forEach( ( mesh ) => {

                const materials = Array.isArray( mesh.material ) ? mesh.material : [ mesh.material ];

                for ( let i = 0; i < materials.length; i ++ ) {
                    if ( materials[i].isMeshWboitMaterial !== true || materials[i].transparent !== true ) continue;

                    materials[i].uniforms[ 'renderStage' ].value = stage.toFixed( 1 );

                    switch ( stage ) {

                        case WboitStages.Acummulation:
                            testCache.set( materials[i], materials[i].depthTest );
                            writeCache.set( materials[i], materials[i].depthWrite );
                            materials[i].blending = THREE.CustomBlending;
                            materials[i].blendEquation = THREE.AddEquation;
                            materials[i].blendSrc = THREE.OneFactor;
                            materials[i].blendDst = THREE.OneFactor;
                            materials[i].depthWrite = false;
                            materials[i].depthTest = true;
                            break;

                        case WboitStages.Revealage:

                            materials[i].blending = THREE.CustomBlending;
                            materials[i].blendEquation = THREE.AddEquation;
                            materials[i].blendSrc = THREE.ZeroFactor;
                            materials[i].blendDst = THREE.OneMinusSrcAlphaFactor;
                            materials[i].depthWrite = false;
                            materials[i].depthTest = true;
                            break;

                        default:
                            materials[i].blending = THREE.NormalBlending;
                            materials[i].blendEquation = THREE.AddEquation
                            materials[i].blendSrc = THREE.SrcAlphaFactor;
                            materials[i].blendDst = THREE.OneMinusSrcAlphaFactor;
                            materials[i].depthWrite = testCache.get( materials[i] );
                            materials[i].depthTest = writeCache.get( materials[i] );

                    }

                }

            } );

        }

        // Save Current State
        const oldAutoClear = renderer.autoClear;;
        const oldClearAlpha = renderer.getClearAlpha();
        const oldRenderTarget = renderer.getRenderTarget();
        const oldOverrideMaterial = scene.overrideMaterial;
        renderer.autoClear = false;
        renderer.getClearColor( this._oldClearColor );
        scene.overrideMaterial = null;

        // Gather Opaque / Transparent Meshes
        gatherMeshes();

        // Render Opaque Objects
        changeVisible( true, false );
        renderer.setRenderTarget( this.baseTarget );
        renderer.setClearColor( _clearColorZero, 0.0 );
        renderer.clear();
        renderer.render( scene, this.camera );
        changeVisible( false, true );

        // Copy Opaque Render to Write Buffer (so we can re-use depth buffer)
        if ( this.clearColor ) {
            renderer.setRenderTarget( writeBuffer );
			renderer.setClearColor( this.clearColor, this.clearAlpha );
            renderer.clearColor();
		}
        this.blendPass.render( renderer, writeBuffer, this.baseTarget );

        // Render Transparent Objects, Accumulation Pass
        prepareWboitBlending( WboitStages.Acummulation );
        renderer.setRenderTarget( this.baseTarget );
        renderer.setClearColor( _clearColorZero, 0.0 );
        renderer.clearColor();
        renderer.render( scene, this.camera );

        // Copy Accumulation Render to temp target (so we can re-use depth buffer)
        this.copyPass.render( renderer, this.accumulationTarget, this.baseTarget );

        // Render Transparent Objects, Revealage Pass
        prepareWboitBlending( WboitStages.Revealage );
        renderer.setRenderTarget( this.baseTarget );
        renderer.setClearColor( _clearColorOne, 1.0 );
        renderer.clearColor();
        renderer.render( scene, this.camera );

        // Composite Transparent Objects
        renderer.setRenderTarget( writeBuffer );
        this.compositePass.uniforms[ 'tAccumulation' ].value = this.accumulationTarget.texture;
        this.compositePass.uniforms[ 'tRevealage' ].value = this.baseTarget.texture; /* now holds revealage render */
        this.compositePass.render( renderer, writeBuffer );

        // Restore Original State
        prepareWboitBlending( WboitStages.Normal );
        resetVisible();
        renderer.setRenderTarget( oldRenderTarget );
        renderer.setClearColor( this._oldClearColor, oldClearAlpha );
        scene.overrideMaterial = oldOverrideMaterial;
        renderer.autoClear = oldAutoClear;

        // Clear Caches
        cache.clear();
        testCache.clear();
        writeCache.clear();
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
// Weighted, Blended OIT:
//      https://learnopengl.com/Guest-Articles/2020/OIT/Weighted-Blended
//      https://therealmjp.github.io/posts/weighted-blended-oit/
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
// three-wboit
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
