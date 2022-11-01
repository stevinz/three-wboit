/** /////////////////////////////////////////////////////////////////////////////////
//
// @description WboitCompositeShader
// @about       Full-screen composite shader for WBOIT for use with WboitPass
// @author      Stephens Nunnally <@stevinz>
// @license     MIT - Copyright (c) 2022 Stephens Nunnally and Scidian Software
// @source      https://github.com/stevinz/three-wboit
//
///////////////////////////////////////////////////////////////////////////////////*/

const WboitTestShader = {

	uniforms: {},

	vertexShader: /* glsl */`

        varying vec2 vUv;

        void main() {

            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

        }

    `,

	fragmentShader: /* glsl */`

        varying vec2 vUv;

        void main() {

            gl_FragColor = vec4( 1.0, 1.0, 1.0, 1.0 );

        }

    `,

};

export { WboitTestShader };
