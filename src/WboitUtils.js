/**
 * Helper utilities for WboitPass
 */

class WboitUtils {

	static enable( objectOrMaterial ) {

		if ( objectOrMaterial.isObject3D ) {

			objectOrMaterial.traverse( ( child ) => {

				if ( child.material ) WboitUtils.enable( child.material );

			});

		}

		let materials = Array.isArray( objectOrMaterial ) ? objectOrMaterial : [ objectOrMaterial ];

		for ( let i = 0; i < materials.length; i ++ ) {

			const material = materials[i];
			if ( ! material.isMaterial ) continue;
			if ( material.wboitEnabled ) continue;

			material.wboitEnabled = true;

			const existingOnBeforeCompile = material.onBeforeCompile;

			material.onBeforeCompile = function( shader, renderer ) {

				if (typeof existingOnBeforeCompile === 'function') existingOnBeforeCompile( shader, renderer );

				shader.fragmentShader = shader.fragmentShader.replace( /}$/gm, `
						gl_FragColor = vec4( 1.0, 1.0, 1.0, 1.0 );
					}
				` );

			}

			material.needsUpdate = true;




			console.log( material );

		}

	}

}

export { WboitUtils };
