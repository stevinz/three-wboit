/**
 * sRGBShader
 */

const sRGBShader = {

	uniforms: {

		'tDiffuse': { value: null }

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
			vec4 tex = texture2D( tDiffuse, vUv );

			// LinearTosRGB( tex );
            gl_FragColor = vec4( mix( pow( tex.rgb, vec3( 0.41666 ) ) * 1.055 - vec3( 0.055 ), tex.rgb * 12.92, vec3( lessThanEqual( tex.rgb, vec3( 0.0031308 ) ) ) ), tex.a );
		}`

};

export { sRGBShader };
