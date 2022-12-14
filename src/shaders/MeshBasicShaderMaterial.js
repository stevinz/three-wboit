
/**
 * MeshBasicMaterial as a ShaderMaterial
 */

import {
    ShaderChunk,
    UniformsLib,
	UniformsUtils
} from 'three';

const MeshBasicShaderMaterial = {

    defines: { USE_MAP: '', USE_UV: '', },

    uniforms: UniformsUtils.merge( [
        UniformsLib.common,
        UniformsLib.specularmap,
        UniformsLib.envmap,
        UniformsLib.aomap,
        UniformsLib.lightmap,
        UniformsLib.fog
    ] ),

    vertexShader: ShaderChunk.meshbasic_vert,

    fragmentShader: ShaderChunk.meshbasic_frag,

};

export { MeshBasicShaderMaterial };
