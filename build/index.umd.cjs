(function (global, factory) {
	typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports, require('three'), require('three/addons/postprocessing/Pass.js'), require('three/addons/postprocessing/ShaderPass.js'), require('three/addons/shaders/CopyShader.js')) :
	typeof define === 'function' && define.amd ? define(['exports', 'three', 'three/addons/postprocessing/Pass.js', 'three/addons/postprocessing/ShaderPass.js', 'three/addons/shaders/CopyShader.js'], factory) :
	(global = typeof globalThis !== 'undefined' ? globalThis : global || self, factory(global.THREE = global["three-wboit"] || {}, global.THREE, global.THREE, global.THREE, global.THREE));
})(this, (function (exports, three, Pass_js, ShaderPass_js, CopyShader_js) { 'use strict';

	/**
	 * Color fill shader
	 */

	const FillShader = {

		uniforms: {

			'color': { value: new three.Color( 0xffffff ) },
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

	/**
	 * MeshWboitMaterial
	 *
	 * Basic material with support for weighted, blended order-independent transparency
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

		uniforms: three.UniformsUtils.merge( [
			{
				renderStage: { value: 0.0 },
				weight: { value: 1.0 },
			},
			three.UniformsLib.common,
			three.UniformsLib.specularmap,
			three.UniformsLib.envmap,
			three.UniformsLib.aomap,
			three.UniformsLib.lightmap,
			three.UniformsLib.fog
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

				#ifndef PREMULTIPLIED_ALPHA
					accum.rgb *= accum.a;
				#endif

				float z = gl_FragCoord.z;

				/* Equation #9 */
				// float w = accum.a * clamp( 0.03 / ( 1e-5 + pow( abs( z ) / 200.0, 4.0 ) ), 0.01, 300.0 );
				// gl_FragColor = vec4( accum.rgb, accum.a ) * w;

				/* McGuire 10/2013 */
				// float w = clamp( pow( ( accum.a * 8.0 + 0.01 ) * ( - z * 0.95 + 1.0 ), 3.0 ) * 1e3, 1e-2, 3e2 );
				// gl_FragColor = vec4( accum.rgb, accum.a ) * w;

				/* Stevinz, Adjustable Weight */
				float scaleWeight = 0.7 + ( 0.3 * weight );
				float w = clamp( pow( ( accum.a * 8.0 + 0.001 ) * ( - z * scaleWeight + 1.0 ), 3.0 ) * 1000.0, 0.001, 300.0 );
				gl_FragColor = vec4( accum.rgb, accum.a ) * w;

			} else if ( renderStage == ${ WboitStages.Revealage.toFixed( 1 ) } ) {

				/* McGuire 10/2013 */
				// gl_FragColor = vec4( gl_FragColor.a );

				/* Stevinz, Distance Weighted */
				gl_FragColor = vec4( gl_FragColor.a * gl_FragCoord.z );

			}

		}`,

	};

	//

	class MeshWboitMaterial extends three.ShaderMaterial {

		constructor( parameters = {} ) {

			super();

			this.isMeshWboitMaterial = true;

			this.type = 'MeshWboitMaterial';

			// Flag for WboitPass

			this.wboitEnabled = true;

			//

			const shader = WboitBasicShader;

			this.defines = {};
			this.uniforms = three.UniformsUtils.clone( shader.uniforms );
			this.vertexShader = shader.vertexShader;
			this.fragmentShader = shader.fragmentShader;

			// properties (no uniforms)

			this.combine = three.MultiplyOperation;

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

					get: function () {

						return this.uniforms[ propertyName ].value;

					},

					set: function ( value ) {

						this.uniforms[ propertyName ].value = value;

					}

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

	const _clearColorZero = new three.Color( 0.0, 0.0, 0.0 );
	const _clearColorOne = new three.Color( 1.0, 1.0, 1.0 );

	const OpaqueShader = {

		uniforms: {

			'tDiffuse': { value: null },

		},

		vertexShader: /* glsl */`

		varying vec2 vUv;

		void main() {

			vUv = uv;
			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

		}`,

		fragmentShader: /* glsl */`

		uniform sampler2D tDiffuse;

		varying vec2 vUv;

		void main() {

			vec4 color = texture2D( tDiffuse, vUv );
			if ( color.a == 0.0 ) discard;
			gl_FragColor = color;

		}`

	};

	class WboitPass extends Pass_js.Pass {

		constructor( renderer, scene, camera, clearColor, clearAlpha ) {

			if ( ! renderer ) return console.error( 'WboitPass: Renderer must be supplied!' );

			super();

			this.scene = scene;
			this.camera = camera;

			this.clearColor = clearColor;
			this.clearAlpha = ( clearAlpha !== undefined ) ? clearAlpha : 0;

			this.clear = false;
			this.clearDepth = false;
			this.needsSwap = false;

			// Internal

			this._oldClearColor = new three.Color();
			this._blendingCache = new Map();
			this._blendEquationCache = new Map();
			this._blendSrcCache = new Map();
			this._blendDstCache = new Map();
			this._depthTestCache = new Map();
			this._depthWriteCache = new Map();
			this._visibilityCache = new Map();

			// Passes

			this.opaquePass = new ShaderPass_js.ShaderPass( OpaqueShader );
			this.opaquePass.material.depthTest = false;
			this.opaquePass.material.depthWrite = false;
			this.opaquePass.material.blending = three.CustomBlending;
			this.opaquePass.material.blendEquation = three.AddEquation;
			this.opaquePass.material.blendSrc = three.OneFactor;
			this.opaquePass.material.blendDst = three.ZeroFactor;

			this.transparentPass = new ShaderPass_js.ShaderPass( CopyShader_js.CopyShader );
			this.transparentPass.material.depthTest = false;
			this.transparentPass.material.depthWrite = false;
			this.transparentPass.material.blending = three.CustomBlending;
			this.transparentPass.material.blendEquation = three.AddEquation;
			this.transparentPass.material.blendSrc = three.OneFactor;
			this.transparentPass.material.blendDst = three.OneMinusSrcAlphaFactor;

			this.copyPass = new ShaderPass_js.ShaderPass( CopyShader_js.CopyShader );
			this.copyPass.material.depthTest = false;
			this.copyPass.material.depthWrite = false;
			this.copyPass.material.blending = three.CustomBlending;
			this.copyPass.material.blendEquation = three.AddEquation;
			this.copyPass.material.blendSrc = three.OneFactor;
			this.copyPass.material.blendDst = three.ZeroFactor;

			this.compositePass = new ShaderPass_js.ShaderPass( WboitCompositeShader );
			this.compositePass.material.transparent = true;
			this.compositePass.material.blending = three.CustomBlending;
			this.compositePass.material.blendEquation = three.AddEquation;
			this.compositePass.material.blendSrc = three.OneMinusSrcAlphaFactor;
			this.compositePass.material.blendDst = three.SrcAlphaFactor;

			const testPass = new ShaderPass_js.ShaderPass( FillShader );
			const testR = 1.0;
			const testG = 1.0;
			const testB = 1.0;
			const testA = 0.0;
			testPass.material.uniforms[ 'color' ].value = new three.Color( testR, testG, testB );
			testPass.material.uniforms[ 'opacity' ].value = testA;
			testPass.material.blending = three.CustomBlending;
			testPass.material.blendEquation = three.AddEquation;
			testPass.material.blendSrc = three.OneFactor;
			testPass.material.blendDst = three.ZeroFactor;

			// Find Best Render Target Type
			// gl.getExtension( 'EXT_color_buffer_float' ) - lacking support, see:
			// https://stackoverflow.com/questions/28827511/webgl-ios-render-to-floating-point-texture

			const size = renderer.getSize( new three.Vector2() );
			const pixelRatio = renderer.getPixelRatio();
			const effectiveWidth = size.width * pixelRatio;
			const effectiveHeight = size.height * pixelRatio;

			const gl = renderer.getContext();

			const oldTarget = renderer.getRenderTarget();
			const oldClearAlpha = renderer.getClearAlpha();
			renderer.getClearColor( this._oldClearColor );

			const targetTypes = [ three.FloatType, three.HalfFloatType, three.UnsignedByteType ];
			const targetGlTypes = [ gl.FLOAT, gl.HALF_FLOAT, gl.UNSIGNED_BYTE ];
			const targetBuffers = [ new Float32Array( 4 ), new Uint16Array( 4 ), new Uint8Array( 4 ) ];
			const targetDivisor = [ 1, 15360, 255 ];

			let targetType;

			for ( let i = 0; i < targetTypes.length; i ++ ) {

				const testTarget = new three.WebGLRenderTarget( 1, 1, {
					minFilter: three.NearestFilter,
					magFilter: three.NearestFilter,
					type: targetTypes[ i ],
					format: three.RGBAFormat,
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

				function fuzzyEqual( a, b, epsilon = 0.01 ) {

					return ( ( a < ( b + epsilon ) ) && ( a > ( b - epsilon ) ) );

				}

				let complete = gl.checkFramebufferStatus( gl.FRAMEBUFFER ) === gl.FRAMEBUFFER_COMPLETE;
				complete = complete && fuzzyEqual( rgba[ 0 ], testR );
				complete = complete && fuzzyEqual( rgba[ 1 ], testG );
				complete = complete && fuzzyEqual( rgba[ 2 ], testB );
				complete = complete && fuzzyEqual( rgba[ 3 ], testA );
				complete = complete || i === targetTypes.length - 1;

				testTarget.dispose();

				if ( complete ) {

					targetType = targetTypes[ i ];
					break;

				}

			}

			if ( testPass.dispose ) testPass.dispose();
			renderer.setRenderTarget( oldTarget );
			renderer.setClearColor( this._oldClearColor, oldClearAlpha );

			// Render Targets

			this.baseTarget = new three.WebGLRenderTarget( effectiveWidth, effectiveHeight, {
				minFilter: three.NearestFilter,
				magFilter: three.NearestFilter,
				type: targetType,
				format: three.RGBAFormat,
				stencilBuffer: false,
				depthBuffer: true,
			} );

			this.accumulationTarget = new three.WebGLRenderTarget( effectiveWidth, effectiveHeight, {
				minFilter: three.NearestFilter,
				magFilter: three.NearestFilter,
				type: targetType,
				format: three.RGBAFormat,
				stencilBuffer: false,
				depthBuffer: false,
			} );

		}

		dispose() {

			if ( this.opaquePass.dispose ) this.opaquePass.dispose();
			if ( this.transparentPass.dispose ) this.transparentPass.dispose();
			if ( this.copyPass.dispose ) this.copyPass.dispose();
			if ( this.compositePass.dispose ) this.compositePass.dispose();

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
			const blendingCache = this._blendingCache;
			const blendEquationCache = this._blendEquationCache;
			const blendSrcCache = this._blendSrcCache;
			const blendDstCache = this._blendDstCache;
			const testCache = this._depthTestCache;
			const writeCache = this._depthWriteCache;

			const opaqueMeshes = [];
			const transparentMeshes = [];
			const wboitMeshes = [];

			function gatherMeshes() {

				scene.traverse( ( object ) => {

					if ( ! object.material ) return;

					const materials = Array.isArray( object.material ) ? object.material : [ object.material ];
					let isTransparent = true;
					let isWboitCapable = true;

					for ( let i = 0; i < materials.length; i ++ ) {

						isTransparent = isTransparent && materials[ i ].transparent;
						isWboitCapable = isWboitCapable && isTransparent && materials[ i ].wboitEnabled;

						testCache.set( materials[ i ], materials[ i ].depthTest );
						writeCache.set( materials[ i ], materials[ i ].depthWrite );

					}

					if ( ! isWboitCapable ) {

						if ( ! isTransparent ) {

							opaqueMeshes.push( object );

							for ( let i = 0; i < materials.length; i ++ ) {

								materials[ i ].depthTest = true;
								materials[ i ].depthWrite = true;

							}

						} else {

							transparentMeshes.push( object );

							for ( let i = 0; i < materials.length; i ++ ) {

								materials[ i ].depthTest = true;
								materials[ i ].depthWrite = false;

							}

						}

					} else {

						wboitMeshes.push( object );

						for ( let i = 0; i < materials.length; i ++ ) {

							blendingCache.set( materials[ i ], materials[ i ].blending );
							blendEquationCache.set( materials[ i ], materials[ i ].blendEquation );
							blendSrcCache.set( materials[ i ], materials[ i ].blendSrc );
							blendDstCache.set( materials[ i ], materials[ i ].blendDst );

						}

					}

					cache.set( object, object.visible );

				} );

			}

			function changeVisible( opaqueVisible = true, transparentVisible = true, wboitVisible = true ) {

				opaqueMeshes.forEach( mesh => mesh.visible = opaqueVisible );
				transparentMeshes.forEach( mesh => mesh.visible = transparentVisible );
				wboitMeshes.forEach( mesh => mesh.visible = wboitVisible );

			}

			function resetVisible() {

				for ( const [ key, value ] of cache ) {

					key.visible = value;

					if ( key.material ) {

						const materials = Array.isArray( key.material ) ? key.material : [ key.material ];

						for ( let i = 0; i < materials.length; i ++ ) {

							materials[ i ].depthWrite = testCache.get( materials[ i ] );
							materials[ i ].depthTest = writeCache.get( materials[ i ] );

						}

					}

				}

			}

			function prepareWboitBlending( stage ) {

				wboitMeshes.forEach( ( mesh ) => {

					const materials = Array.isArray( mesh.material ) ? mesh.material : [ mesh.material ];

					for ( let i = 0; i < materials.length; i ++ ) {

						if ( materials[ i ].wboitEnabled !== true || materials[ i ].transparent !== true ) continue;

						if ( materials[ i ].renderStage ) {

							materials[ i ].renderStage = stage;

						} else if ( materials[ i ].uniforms && materials[ i ].uniforms[ 'renderStage' ] ) {

							materials[ i ].uniforms[ 'renderStage' ].value = stage.toFixed( 1 );

						}

						switch ( stage ) {

							case WboitStages.Acummulation:

								materials[ i ].blending = three.CustomBlending;
								materials[ i ].blendEquation = three.AddEquation;
								materials[ i ].blendSrc = three.OneFactor;
								materials[ i ].blendDst = three.OneFactor;
								materials[ i ].depthWrite = false;
								materials[ i ].depthTest = true;

								break;

							case WboitStages.Revealage:

								materials[ i ].blending = three.CustomBlending;
								materials[ i ].blendEquation = three.AddEquation;
								materials[ i ].blendSrc = three.ZeroFactor;
								materials[ i ].blendDst = three.OneMinusSrcAlphaFactor;
								materials[ i ].depthWrite = false;
								materials[ i ].depthTest = true;

								break;

							default:

								materials[ i ].blending = blendingCache.get( materials[ i ] );
								materials[ i ].blendEquation = blendEquationCache.get( materials[ i ] );
								materials[ i ].blendSrc = blendSrcCache.get( materials[ i ] );
								materials[ i ].blendDst = blendDstCache.get( materials[ i ] );

						}

					}

				} );

			}

			// Save Current State
			const oldAutoClear = renderer.autoClear;
			const oldClearAlpha = renderer.getClearAlpha();
			const oldRenderTarget = renderer.getRenderTarget();
			const oldOverrideMaterial = scene.overrideMaterial;
			renderer.autoClear = false;
			renderer.getClearColor( this._oldClearColor );
			scene.overrideMaterial = null;

			// Gather Opaque / Transparent Meshes
			gatherMeshes();

			// Clear Write Buffer
			if ( this.clearColor ) {

				renderer.setRenderTarget( writeBuffer );
				renderer.setClearColor( this.clearColor, this.clearAlpha );
				renderer.clearColor();

			}

			// Render Opaque Objects (copy render to write buffer so we can re-use depth buffer)
			changeVisible( true, false, false );
			renderer.setRenderTarget( this.baseTarget );
			renderer.setClearColor( _clearColorZero, 0.0 );
			renderer.clear();
			renderer.render( scene, this.camera );
			this.opaquePass.render( renderer, writeBuffer, this.baseTarget );

			// Render Transparent Objects (copy render to write buffer so we can re-use depth buffer)
			changeVisible( false, true, false );
			renderer.setRenderTarget( this.baseTarget );
			renderer.clearColor();
			renderer.render( scene, this.camera );
			this.transparentPass.render( renderer, writeBuffer, this.baseTarget );

			// Render Wboit Objects, Accumulation Pass (copy render to write buffer so we can re-use depth buffer)
			changeVisible( false, false, true );
			prepareWboitBlending( WboitStages.Acummulation );
			renderer.setRenderTarget( this.baseTarget );
			renderer.clearColor();
			renderer.render( scene, this.camera );
			this.copyPass.render( renderer, this.accumulationTarget, this.baseTarget );

			// Render Wboit Objects, Revealage Pass
			prepareWboitBlending( WboitStages.Revealage );
			renderer.setRenderTarget( this.baseTarget );
			renderer.setClearColor( _clearColorOne, 1.0 );
			renderer.clearColor();
			renderer.render( scene, this.camera );

			// Composite Wboit Objects
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
			blendingCache.clear();
			blendEquationCache.clear();
			blendSrcCache.clear();
			blendDstCache.clear();
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

	/**
	 * Helper utilities for WboitPass
	 */

	let _materialCounter = 0;
	const _stage = { value: 0.5 };

	class WboitUtils {

		static patch( existingMaterial ) {

			let materials = Array.isArray( existingMaterial ) ? existingMaterial : [ existingMaterial ];

			for ( let i = 0; i < materials.length; i ++ ) {

				const material = materials[i];
				if ( ! material.isMaterial ) continue;
				if ( material.wboitEnabled ) continue;

				const existingOnBeforeCompile = material.onBeforeCompile;

				material.onBeforeCompile = function( shader, renderer ) {

					if ( material.wboitEnabled === true ) return;
					material.wboitEnabled = true;

					if (typeof existingOnBeforeCompile === 'function') existingOnBeforeCompile( shader, renderer );

					shader.uniforms.renderStage = _stage;
					shader.uniforms.weight = { value: 1.0 };

					shader.fragmentShader = `
					uniform float renderStage;
					uniform float weight;
				` + shader.fragmentShader;

					shader.fragmentShader = shader.fragmentShader.replace( /}$/gm, `

					if ( renderStage == ${ WboitStages.Acummulation.toFixed( 1 ) } ) {

						vec4 accum = gl_FragColor.rgba;

						#ifndef PREMULTIPLIED_ALPHA
							accum.rgb *= accum.a;
						#endif

						float z = gl_FragCoord.z;

						float scaleWeight = 0.7 + ( 0.3 * weight );
						float w = clamp( pow( ( accum.a * 8.0 + 0.001 ) * ( - z * scaleWeight + 1.0 ), 3.0 ) * 1000.0, 0.001, 300.0 );
						gl_FragColor = vec4( accum.rgb, accum.a ) * w;

					} else if ( renderStage == ${ WboitStages.Revealage.toFixed( 1 ) } ) {

					 	gl_FragColor = vec4( gl_FragColor.a * gl_FragCoord.z );

					}

				}` );

					Object.defineProperty( material, 'renderStage', {

						get: function() {

							return _stage;

						},

						set: function( stage ) {

							_stage.value = parseFloat( stage );

						}

					} );

				};

				const materialID = _materialCounter;
				_materialCounter ++;

				material.customProgramCacheKey = function () {

					return materialID;

				};

				material.needsUpdate = true;

			}

		}

	}

	exports.FillShader = FillShader;
	exports.MeshWboitMaterial = MeshWboitMaterial;
	exports.WboitCompositeShader = WboitCompositeShader;
	exports.WboitPass = WboitPass;
	exports.WboitUtils = WboitUtils;

}));
//# sourceMappingURL=index.umd.cjs.map
