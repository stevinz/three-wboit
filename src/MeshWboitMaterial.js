/** /////////////////////////////////////////////////////////////////////////////////
//
// @description MeshWboitMaterial
// @about       Reimplementation of MeshBasicMaterial for use with transparent Meshes rendered with WboitPass
// @author      Stephens Nunnally <@stevinz>
// @license     MIT - Copyright (c) 2022 Stephens Nunnally and Scidian Software
// @source      https://github.com/stevinz/three-oit
//
///////////////////////////////////////////////////////////////////////////////////*/

import { UniformsUtils, UniformsLib, ShaderMaterial, MultiplyOperation } from 'three';
import { CustomBlending, AddEquation, OneFactor, ZeroFactor, OneMinusSrcAlphaFactor } from 'three';

const WboitBasicShader = {

    //  based on MeshBasicMaterial, see:
    //      https://github.com/mrdoob/three.js/blob/dev/src/materials/MeshBasicMaterial.js
    //      https://github.com/mrdoob/three.js/blob/dev/src/renderers/shaders/ShaderLib.js
    //      https://github.com/mrdoob/three.js/blob/dev/src/renderers/shaders/ShaderLib/meshbasic.glsl.js

	uniforms: UniformsUtils.merge( [
		UniformsLib.common,
		UniformsLib.specularmap,
		UniformsLib.envmap,
		UniformsLib.aomap,
		UniformsLib.lightmap,
		UniformsLib.fog
	] ),

	vertexShader: /* glsl */`

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

        void main() {

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

            @__WBOIT__

        }

    `

};

//

const WboitShaderStages = {

    ACCUMULATION: 'accumulation',
    REVEALAGE: 'revealage',

}

//

class MeshWboitMaterial extends ShaderMaterial {

	constructor( parameters = {} ) {

		super();

		this.isMeshWboitMaterial = true;

		this.type = 'MeshWboitMaterial';

		const shader = WboitBasicShader;

        this.stage = parameters.stage ?? WboitShaderStages.ACCUMULATION;
		this.defines = {};
		this.uniforms = UniformsUtils.clone( shader.uniforms );
		this.vertexShader = shader.vertexShader;

        //  Need?
        //      precision highp float;
        //      precision highp int;

        // force critical parameters

        parameters.depthWrite = false;
        parameters.depthTest = true;
        parameters.transparent = true;
        parameters.blending = CustomBlending;
        parameters.blendEquation = AddEquation;

        //

        if ( this.stage === WboitShaderStages.ACCUMULATION ) {

            parameters.blendSrc = OneFactor;
            parameters.blendDst = OneFactor;

            this.fragmentShader = shader.fragmentShader.replace( `@__WBOIT__`, `

                vec4 accum = gl_FragColor.rgba;
                accum.rgb *= accum.a;
                float w = clamp( pow( ( accum.a * 8.0 + 0.01 ) * ( - gl_FragCoord.z * 0.95 + 1.0 ), 3.0 ) * 1e3, 1e-2, 3e2 );
                gl_FragColor = vec4( accum.rgb, accum.a ) * w;

            `);

        } else {

            parameters.blendSrc = ZeroFactor;
            parameters.blendDst = OneMinusSrcAlphaFactor;

            this.fragmentShader = shader.fragmentShader.replace( `@__WBOIT__`, `

                gl_FragColor = vec4( gl_FragColor.a );

            `);

        }

        // properties (no uniforms)

		this.combine = MultiplyOperation;

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

        //

        this.stage = source.stage;

		return this;

	}

}

export { MeshWboitMaterial, WboitShaderStages };
