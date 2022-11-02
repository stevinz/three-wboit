(function (global, factory) {
	typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports, require('three'), require('three/addons/postprocessing/Pass.js'), require('three/addons/postprocessing/ShaderPass.js'), require('three/addons/shaders/CopyShader.js')) :
	typeof define === 'function' && define.amd ? define(['exports', 'three', 'three/addons/postprocessing/Pass.js', 'three/addons/postprocessing/ShaderPass.js', 'three/addons/shaders/CopyShader.js'], factory) :
	(global = typeof globalThis !== 'undefined' ? globalThis : global || self, factory(global.THREE = global["three-wboit"] || {}, global.THREE, global.THREE, global.THREE, global.THREE));
})(this, (function (exports, THREE, Pass_js, ShaderPass_js, CopyShader_js) { 'use strict';

	function _interopNamespaceDefault(e) {
		var n = Object.create(null);
		if (e) {
			Object.keys(e).forEach(function (k) {
				if (k !== 'default') {
					var d = Object.getOwnPropertyDescriptor(e, k);
					Object.defineProperty(n, k, d.get ? d : {
						enumerable: true,
						get: function () { return e[k]; }
					});
				}
			});
		}
		n.default = e;
		return Object.freeze(n);
	}

	var THREE__namespace = /*#__PURE__*/_interopNamespaceDefault(THREE);

	/**
	 * MeshWboitMaterial
	 *
	 * Basic material with support for weighted, blended order-independent transparency
	 *
	 */

	const WboitStages = {
		Normal: 0.0,
		Acummulation: 1.0,
		Revealage: 2.0,
	};

	const WboitBasicShader = {

		// based on MeshBasicMaterial
		// https://github.com/mrdoob/three.js/blob/dev/src/materials/MeshBasicMaterial.js
		// https://github.com/mrdoob/three.js/blob/dev/src/renderers/shaders/ShaderLib.js
		// https://github.com/mrdoob/three.js/blob/dev/src/renderers/shaders/ShaderLib/meshbasic.glsl.js

		uniforms: THREE.UniformsUtils.merge( [
			{
				renderStage: { value: 0.0 },
				weight: { value: 1.0 },
			},
			THREE.UniformsLib.common,
			THREE.UniformsLib.specularmap,
			THREE.UniformsLib.envmap,
			THREE.UniformsLib.aomap,
			THREE.UniformsLib.lightmap,
			THREE.UniformsLib.fog
		] ),

		vertexShader: /* glsl */`

		// MeshBasicMaterial

		#include <common>
		#include <uv_pars_vertex>
		#include <uv2_pars_vertex>
		#include <envmap_pars_vertex>
		#include <color_pars_vertex>
		#include <fog_pars_vertex>
		#include <morphtarget_pars_vertex>
		#include <skinning_pars_vertex>
		#include <logdepthbuf_pars_vertex>
		#include <clipping_planes_pars_vertex>

		void main() {

			// MeshBasicMaterial

			#include <uv_vertex>
			#include <uv2_vertex>
			#include <color_vertex>
			#include <morphcolor_vertex>

			#if defined ( USE_ENVMAP ) || defined ( USE_SKINNING )

				#include <beginnormal_vertex>
				#include <morphnormal_vertex>
				#include <skinbase_vertex>
				#include <skinnormal_vertex>
				#include <defaultnormal_vertex>

			#endif

			#include <begin_vertex>
			#include <morphtarget_vertex>
			#include <skinning_vertex>
			#include <project_vertex>
			#include <logdepthbuf_vertex>
			#include <clipping_planes_vertex>

			#include <worldpos_vertex>
			#include <envmap_vertex>
			#include <fog_vertex>

		}`,

		fragmentShader: /* glsl */`

		precision highp float;
		precision highp int;

		// MeshBasicMaterial

		uniform vec3 diffuse;
		uniform float opacity;

		#ifndef FLAT_SHADED

			varying vec3 vNormal;

		#endif

		#include <common>
		#include <dithering_pars_fragment>
		#include <color_pars_fragment>
		#include <uv_pars_fragment>
		#include <uv2_pars_fragment>
		#include <map_pars_fragment>
		#include <alphamap_pars_fragment>
		#include <alphatest_pars_fragment>
		#include <aomap_pars_fragment>
		#include <lightmap_pars_fragment>
		#include <envmap_common_pars_fragment>
		#include <envmap_pars_fragment>
		#include <fog_pars_fragment>
		#include <specularmap_pars_fragment>
		#include <logdepthbuf_pars_fragment>
		#include <clipping_planes_pars_fragment>

		// MeshWboitMaterial

		uniform float renderStage;
		uniform float weight;

		void main() {

			// MeshBasicMaterial

			#include <clipping_planes_fragment>

			vec4 diffuseColor = vec4( diffuse, opacity );

			#include <logdepthbuf_fragment>
			#include <map_fragment>
			#include <color_fragment>
			#include <alphamap_fragment>
			#include <alphatest_fragment>
			#include <specularmap_fragment>

			ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );

			// accumulation (baked indirect lighting only)

			#ifdef USE_LIGHTMAP

				vec4 lightMapTexel = texture2D( lightMap, vUv2 );
				reflectedLight.indirectDiffuse += lightMapTexel.rgb * lightMapIntensity * RECIPROCAL_PI;

			#else

				reflectedLight.indirectDiffuse += vec3( 1.0 );

			#endif

			// modulation

			#include <aomap_fragment>

			reflectedLight.indirectDiffuse *= diffuseColor.rgb;

			vec3 outgoingLight = reflectedLight.indirectDiffuse;

			#include <envmap_fragment>
			#include <output_fragment>
			#include <tonemapping_fragment>
			#include <encodings_fragment>
			#include <fog_fragment>
			#include <premultiplied_alpha_fragment>
			#include <dithering_fragment>

			// MeshWboitMaterial

			if ( renderStage == ${ WboitStages.Acummulation.toFixed( 1 ) } ) {

				vec4 accum = gl_FragColor.rgba;
				float z = gl_FragCoord.z;

				// // McGuire 10/2013
				// float w = clamp( pow( ( accum.a * 8.0 + 0.01 ) * ( - z * 0.95 + 1.0 ), 3.0 ) * 1e3, 1e-2, 3e2 );
				// gl_FragColor = vec4( accum.rgb * accum.a, accum.a ) * w;

				// // Equation #9
				// float w = accum.a * clamp( 0.03 / ( 1e-5 + pow( abs( z ) / 200.0, 4.0 ) ), 0.01, 300.0 );
				// gl_FragColor = vec4( accum.rgb * accum.a, accum.a ) * w;

				// // Stevinz 10/2022
				float scaleWeight = 0.7 + ( 0.3 * weight );
				float w = clamp( pow( ( accum.a * 8.0 + 0.001 ) * ( - z * scaleWeight + 1.0 ), 3.0 ) * 1000.0, 0.001, 300.0 );
				gl_FragColor = vec4( accum.rgb * accum.a, accum.a ) * w;

			} else if ( renderStage == ${ WboitStages.Revealage.toFixed( 1 ) } ) {

				gl_FragColor = vec4( gl_FragColor.a * gl_FragCoord.z );

			}

		}`,

	};

	//

	class MeshWboitMaterial extends THREE.ShaderMaterial {

		constructor( parameters = {} ) {

			super();

			this.isMeshWboitMaterial = true;

			this.type = 'MeshWboitMaterial';

			const shader = WboitBasicShader;

			this.defines = {};
			this.uniforms = THREE.UniformsUtils.clone( shader.uniforms );
			this.vertexShader = shader.vertexShader;
			this.fragmentShader = shader.fragmentShader;

			// properties (no uniforms)

			this.combine = THREE.MultiplyOperation;

			this.transparent = true;

			this.wireframe = false;
			this.wireframeLinewidth = 1;
			this.wireframeLinecap = 'round';
			this.wireframeLinejoin = 'round';

			this.fog = true;

			// properties (associated w/ uniforms)

			const exposePropertyNames = [

				// Material

				'opacity',

				// MeshBasicMaterial

				'diffuse',
				'map',
				'lightMap',
				'lightMapIntensity',
				'aoMap',
				'aoMapIntensity',
				'specularMap',
				'alphaMap',
				'alphaTest',
				'envMap',
				'reflectivity',
				'refractionRatio',

				// MeshWboitMaterial,

				'weight',

			];

			for ( const propertyName of exposePropertyNames ) {

				Object.defineProperty( this, propertyName, {

					get: function () { return this.uniforms[ propertyName ].value; },

					set: function ( value ) { this.uniforms[ propertyName ].value = value; }

				} );

			}

			Object.defineProperty( this, 'color', Object.getOwnPropertyDescriptor( this, 'diffuse' ) );

			this.setValues( parameters );

		}

		copy( source ) {

			super.copy( source );

			// MeshBasicMaterial

			this.color.copy( source.color );

			this.map = source.map;

			this.lightMap = source.lightMap;
			this.lightMapIntensity = source.lightMapIntensity;

			this.aoMap = source.aoMap;
			this.aoMapIntensity = source.aoMapIntensity;

			this.specularMap = source.specularMap;

			this.alphaMap = source.alphaMap;

			this.envMap = source.envMap;
			this.combine = source.combine;
			this.reflectivity = source.reflectivity;
			this.refractionRatio = source.refractionRatio;

			this.wireframe = source.wireframe;
			this.wireframeLinewidth = source.wireframeLinewidth;
			this.wireframeLinecap = source.wireframeLinecap;
			this.wireframeLinejoin = source.wireframeLinejoin;

			this.fog = source.fog;

			// MeshWboitMaterial

			this.weight = source.weight;

			return this;

		}

	}

	/**
	 * Combine accumulation and revealage for weighted, blended order-independent transparency
	 */

	const WboitCompositeShader = {

		uniforms: {

			'tAccumulation': { value: null },
			'tRevealage': { value: null }

		},

		vertexShader: /* glsl */`

		varying vec2 vUv;

		void main() {

			vUv = uv;
			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

		}`,

		fragmentShader: /* glsl */`

		precision highp float;
		precision highp int;

		varying vec2 vUv;

		uniform sampler2D tAccumulation;
		uniform sampler2D tRevealage;

		float EPSILON = 0.00001;

		bool fuzzyEqual( float a, float b ) {

			return abs( a - b ) <= ( abs( a ) < abs( b ) ? abs( b ) : abs( a ) ) * EPSILON;

		}

		void main() {

			float reveal = texture2D( tRevealage, vUv ).r;
			if ( fuzzyEqual( reveal, 1.0 ) ) discard;

			vec4 accum = texture2D( tAccumulation, vUv );

			vec4 composite = vec4( accum.rgb / clamp( accum.a, 0.0001, 50000.0 ), reveal );
			gl_FragColor = clamp( composite, 0.01, 300.0 );

		}`,

	};

	/**
	 * Color fill shader
	 */

	const FillShader = {

		uniforms: {

			'color': { value: new THREE.Color( 0xffffff ) },
			'opacity': { value: 1.0 }

		},

		vertexShader: /* glsl */`

		void main() {

			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

		}`,

		fragmentShader: /* glsl */`

		uniform vec3 color;
		uniform float opacity;

		void main() {

			gl_FragColor = vec4( color, opacity );

		}`

	};

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

	const _clearColorZero = new THREE__namespace.Color( 0.0, 0.0, 0.0 );
	const _clearColorOne = new THREE__namespace.Color( 1.0, 1.0, 1.0 );

	/////////////////////////////////////////////////////////////////////////////////////
	/////   Weighted, Blended Order-Independent Transparency
	/////////////////////////////////////////////////////////////////////////////////////

	class WboitPass extends Pass_js.Pass {

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

			this._oldClearColor = new THREE__namespace.Color();
	        this._depthTestCache = new Map();
	        this._depthWriteCache = new Map();
	        this._visibilityCache = new Map();

	        // Passes

	        this.blendPass = new ShaderPass_js.ShaderPass( CopyShader_js.CopyShader );
	        this.blendPass.material.depthTest = false;
	        this.blendPass.material.depthWrite = false;
	        this.blendPass.material.blending = THREE__namespace.CustomBlending;
	        this.blendPass.material.blendEquation = THREE__namespace.AddEquation;
	        this.blendPass.material.blendSrc = THREE__namespace.SrcAlphaFactor;
	        this.blendPass.material.blendDst = THREE__namespace.OneMinusSrcAlphaFactor;

	        this.copyPass = new ShaderPass_js.ShaderPass( CopyShader_js.CopyShader );
	        this.copyPass.material.depthTest = false;
	        this.copyPass.material.depthWrite = false;
	        this.copyPass.material.blending = THREE__namespace.CustomBlending;
	        this.copyPass.material.blendEquation = THREE__namespace.AddEquation;
	        this.copyPass.material.blendSrc = THREE__namespace.OneFactor;
	        this.copyPass.material.blendDst = THREE__namespace.ZeroFactor;

	        this.compositePass = new ShaderPass_js.ShaderPass( WboitCompositeShader );
	        this.compositePass.material.transparent = true;
	        this.compositePass.material.blending = THREE__namespace.CustomBlending;
	        this.compositePass.material.blendEquation = THREE__namespace.AddEquation;
	        this.compositePass.material.blendSrc = THREE__namespace.OneMinusSrcAlphaFactor;
	        this.compositePass.material.blendDst = THREE__namespace.SrcAlphaFactor;

	        const testPass = new ShaderPass_js.ShaderPass( FillShader );
	        const testR = 1.0;
	        const testG = 1.0;
	        const testB = 1.0;
	        const testA = 0.0;
	        testPass.material.uniforms[ 'color' ].value = new THREE__namespace.Color( testR, testG, testB );
	        testPass.material.uniforms[ 'opacity' ].value = testA;
	        testPass.material.blending = THREE__namespace.CustomBlending;
	        testPass.material.blendEquation = THREE__namespace.AddEquation;
	        testPass.material.blendSrc = THREE__namespace.OneFactor;
	        testPass.material.blendDst = THREE__namespace.ZeroFactor;

	        // Find Best Render Target Type

	        const size = renderer.getSize( new THREE__namespace.Vector2() );
	        const pixelRatio = renderer.getPixelRatio();
	        const effectiveWidth = size.width * pixelRatio;
	        const effectiveHeight = size.height * pixelRatio;

	        const gl = renderer.getContext();

	        const oldTarget = renderer.getRenderTarget();
	        const oldClearAlpha = renderer.getClearAlpha();
	        renderer.getClearColor( this._oldClearColor );

	        const targetTypes = [ THREE__namespace.FloatType, THREE__namespace.HalfFloatType, THREE__namespace.UnsignedByteType ];
	        const targetGlTypes = [ gl.FLOAT, gl.HALF_FLOAT, gl.UNSIGNED_BYTE ];
	        const targetBuffers = [ new Float32Array( 4 ), new Uint16Array( 4 ), new Uint8Array( 4 ) ];
	        const targetDivisor = [ 1, 15360, 255 ];

	        let targetType;

	        // gl.getExtension( 'EXT_color_buffer_float' ) lacking support, see:
	        // https://stackoverflow.com/questions/28827511/webgl-ios-render-to-floating-point-texture

	        for ( let i = 0; i < targetTypes.length; i ++ ) {

	            const testTarget = new THREE__namespace.WebGLRenderTarget( 1, 1, {
	                minFilter: THREE__namespace.NearestFilter,
	                magFilter: THREE__namespace.NearestFilter,
	                type: targetTypes[ i ],
	                format: THREE__namespace.RGBAFormat,
	                stencilBuffer: false,
	                depthBuffer: true,
	            } );

	            testPass.render( renderer, testTarget );

	            gl.readPixels( 0, 0, 1, 1, gl.RGBA, targetGlTypes[ i ], targetBuffers[ i ] );
	            const rgba = Array.apply( [], targetBuffers[ i ] );
	            rgba[ 0 ] /= targetDivisor[ i ];
	            rgba[ 1 ] /= targetDivisor[ i ];
	            rgba[ 2 ] /= targetDivisor[ i ];
	            rgba[ 3 ] /= targetDivisor[ i ];

	            function fuzzyCompare( a, b, epsilon = 0.01 ) { return Math.abs( a - b ) < epsilon; }

	            let complete = gl.checkFramebufferStatus( gl.FRAMEBUFFER ) === gl.FRAMEBUFFER_COMPLETE;
	            complete = complete && fuzzyCompare( rgba[ 0 ], testR );
	            complete = complete && fuzzyCompare( rgba[ 1 ], testG );
	            complete = complete && fuzzyCompare( rgba[ 2 ], testB );
	            complete = complete && fuzzyCompare( rgba[ 3 ], testA );
	            complete = complete || i === targetTypes.length - 1;

	            testTarget.dispose();

	            if ( complete ) {
	                targetType = targetTypes[ i ];
	                break;
	            }

	        }

	        testPass.dispose();
	        renderer.setRenderTarget( oldTarget );
	        renderer.setClearColor( this._oldClearColor, oldClearAlpha );

	        // Render Targets

	        this.baseTarget = new THREE__namespace.WebGLRenderTarget( effectiveWidth, effectiveHeight, {
	            minFilter: THREE__namespace.NearestFilter,
	            magFilter: THREE__namespace.NearestFilter,
	            type: targetType,
	            format: THREE__namespace.RGBAFormat,
	            stencilBuffer: false,
	            depthBuffer: true,
	        } );

	        this.accumulationTarget = new THREE__namespace.WebGLRenderTarget( effectiveWidth, effectiveHeight, {
	            minFilter: THREE__namespace.NearestFilter,
	            magFilter: THREE__namespace.NearestFilter,
	            type: targetType,
	            format: THREE__namespace.RGBAFormat,
	            stencilBuffer: false,
	            depthBuffer: false,
	        } );

	    }

	    dispose() {

	        this.blendPass.dispose();
	        this.copyPass.dispose();
	        this.compositePass.dispose();

	        this.baseTarget.dispose();
	        this.accumulationTarget.dispose();

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
	                            materials[i].blending = THREE__namespace.CustomBlending;
	                            materials[i].blendEquation = THREE__namespace.AddEquation;
	                            materials[i].blendSrc = THREE__namespace.OneFactor;
	                            materials[i].blendDst = THREE__namespace.OneFactor;
	                            materials[i].depthWrite = false;
	                            materials[i].depthTest = true;
	                            break;

	                        case WboitStages.Revealage:

	                            materials[i].blending = THREE__namespace.CustomBlending;
	                            materials[i].blendEquation = THREE__namespace.AddEquation;
	                            materials[i].blendSrc = THREE__namespace.ZeroFactor;
	                            materials[i].blendDst = THREE__namespace.OneMinusSrcAlphaFactor;
	                            materials[i].depthWrite = false;
	                            materials[i].depthTest = true;
	                            break;

	                        default:
	                            materials[i].blending = THREE__namespace.NormalBlending;
	                            materials[i].blendEquation = THREE__namespace.AddEquation;
	                            materials[i].blendSrc = THREE__namespace.SrcAlphaFactor;
	                            materials[i].blendDst = THREE__namespace.OneMinusSrcAlphaFactor;
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
	// THREE Issue:
	//      https://github.com/mrdoob/three.js/issues/9977
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

	exports.MeshWboitMaterial = MeshWboitMaterial;
	exports.WboitCompositeShader = WboitCompositeShader;
	exports.WboitPass = WboitPass;

}));
//# sourceMappingURL=index.umd.cjs.map
