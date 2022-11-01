# Three Wboit

Weighted, Blended Order Independent Transparency ([paper](http://jcgt.org/published/0002/02/09/), [blog](http://casual-effects.blogspot.com/2015/03/implemented-weighted-blended-order.html)) for use with [three.js](https://threejs.org/). This implementation is designed as a rendering [Pass](https://github.com/mrdoob/three.js/blob/dev/examples/jsm/postprocessing/Pass.js). It can be used as a stand-alone replacement for a traditional render pass (i.e. `renderer.render()`), or used as part of a larger rendering stack within [Effect Composer](https://github.com/mrdoob/three.js/blob/dev/examples/jsm/postprocessing/EffectComposer.js).

## More Info

There are sveral common techniques available for [order independent transparency](https://learnopengl.com/Guest-Articles/2020/OIT/Introduction). This implementation uses WBOIT for it's high performance and compatibility on slower hardware. This implementation is both WebGL 1 compatible and mobile friendly.

WBOIT is approximate, though, and while it provides good results it may not be appropriate for all use cases. One of the biggest advantages is for the rendering of highly detailed transparent models. Typically when rendering such a model it is common for some faces to be depth culled. When rendering with WBOIT, all faces will be visible.

There are a variety of weight functions available when rendering with WBOIT. This is partially due to inconsistencies with overlapping pixels at differing depths. Some weight functions are better at incorporating camera near / far planes, some are better at handling large groups of triangles. This implementation includes a weight modifier that attempts to adjust both opacity and color depending on the depth of the transparent pixels.

## Examples

- <a href='https://stevinz.github.io/three-wboit/WeightedBlended.html'>Transparent Scene Demos</a>

## Install

- Option 1: Copy files from `src` directory into project, import from files...

```javascript
import { MeshWboitMaterial } from './materials/MeshWboitMaterial.js';
import { WboitPass } from './WboitPass.js';
```

- Option 2: Install from [npm](https://www.npmjs.com/package/three-wboit), import from 'three-wboit'...
```
npm install three-wboit
```
```javascript
import { MeshWboitMaterial, WboitPass } from 'three-wboit';
```

- Option 3: Import directly from CDN...
```javascript
import { MeshWboitMaterial, WboitPass } from 'https://unpkg.com/three-wboit/build/index.module.js';
```

## Usage

To setup your scene to use WBOIT, create an instance of `WboitPass`.

When creating `Mesh` objects intended to be transparent, use the included material `MeshWboitMaterial`. Objects using this material have WBOIT enabled by default. WBOIT can be turned on / off on each object by setting the material's `transparent` property. The material is functionaly equivalent to `MeshBasicMaterial`, and supports all it's [methods and properties](https://threejs.org/docs/#api/en/materials/MeshBasicMaterial).

When rendering your scene, instead of calling `renderer.render()`, call `wboitPass.render( renderer )`. Enjoy.

```javascript
import * as THREE from 'three';

import { MeshWboitMaterial, WboitPass } from 'three-wboit';

const renderer = new THREE.WebGLRenderer( { preserveDrawingBuffer: true } );

const camera = new THREE.PerspectiveCamera( 50, window.innerWidth / window.innerHeight, 0.10, 100 );

const scene = new THREE.Scene();
scene.add( new THREE.BoxGeometry(), new MeshWboitMaterial( { opacity: 0.5 } ) );

const wboitPass = new WboitPass( renderer, scene, camera, 0 /* optional clear color */, 1.0 /* optional clear alpha */);

...

render() {

    // OLD:
    //  renderer.render( scene, camera );

    // NEW:
    wboitPass.render( renderer );

}

```

## Acknowledgements

- Weighted, Blended Order-Independent Transparency by Morgan McGuire and Louis Bavoil - [Paper](http://jcgt.org/published/0002/02/09/)
- Weighted, Blended WebGL 2 Example by Tarek Sherif [@tsherif](https://github.com/tsherif) - [Repo](https://github.com/tsherif/webgl2examples/blob/master/oit.html)
- Weighted, Blended Three.js Example by Alexander Rose [@arose](https://github.com/arose) - [Issue](https://github.com/mrdoob/three.js/issues/4814)
- Depth Peel Three.js Example by Dusan Bosnjak [@pailhead](https://github.com/pailhead) - [Pull](https://github.com/mrdoob/three.js/pull/15490)

## License

Released under the terms of the MIT license, so it is free to use in your free or commercial projects.

Copyright (c) 2022 Stephens Nunnally <@stevinz>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
