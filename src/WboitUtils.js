/**
 * Helper utilities for WboitPass
 */

import { WboitStages } from './materials/MeshWboitMaterial.js';

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

						gl_FragColor = accum * w;

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

			}

			const materialID = _materialCounter;
			_materialCounter ++;

			material.customProgramCacheKey = function () {

				return materialID;

			};

			material.needsUpdate = true;

		}

	}

}

export { WboitUtils };
