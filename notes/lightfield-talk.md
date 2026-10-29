# The light-field talk: narrative

*Hour-long talk. This file records only what Steve has said about it, in his
words where possible. Nothing else goes in without his say-so.*

## The point of the talk, in Steve's words

There's a really cool thing I'd like to do in computer graphics that gets
around an obvious difficulty with other methods. The math of it is
beautiful, but coding it is going to be super annoying (for different
meshes, etc.), so AI coding lets me focus on the math and make something
awesome.

## The arc, as Steve has laid it out

1. Start with examples of beautiful path-traced images, both Steve's and from
   movies. No cold open.

2. Then talk about the theory of realistic image rendering ("lots of
   decisions we need to make here").

3. Eventually write down a basic unidirectional path tracer (not derived
   rigorously) and see how it converges.

4. Then the downsides: you want to move the camera a little bit and the image
   needs to be rebuilt from scratch. But we can think through the theory of
   this mathematically and try to understand another, crazier method to make
   an image.

5. Then back up and introduce the whole picture from the beginning: light
   fields, realistic light fields, cameras, etc.

6. Then we reach the idea: store an entire equilibrium light field, a fixed
   point of some enormous operator, on disk; then call it up and integrate it
   via a lens/camera model to produce a real-time image. This last integral is
   fast (only 2D or 4D or so), so we can essentially move around in real time.
   Show all the bits and pieces: unrolling objects, storing the tangent bundle
   on the surface as textures, running the computation, etc.; then running an
   integral over this, calling up pixels and reading their values to
   contribute to an image; and then we have our real-time program.

7. Then talk a bit about the challenges of designing such a thing from a
   software perspective, and how AI can help (and did help) code it up, so
   that Steve could focus on the mathematical bits and the understanding of
   the story.

## What Steve has said beyond the arc

- The real story for real materials, not (mostly) the special diffuse case.
- Include what we do with a spectrum to get to RGB or whatever.
- Go with "A": tell the spectral story, and say that what is stored is RGB.
  But even RGB isn't going to be a big deal.
- Not looking to dig into approximations in this talk.
- "I want to say true things."
