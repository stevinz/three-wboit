/**
 * Helper utilities for WboitPass
 */

class WboitUtils {

    static enableMaterial( material ) {

        let materials = Array.isArray( object.material ) ? object.material : [ object.material ];

        for ( let i = 0; i < materials.length; i ++ ) {

            let material = materials[i];
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