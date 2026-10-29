# Tracing Light Fields

> Some cool animated live graphic about path tracing: maybe changing focus on
> a cool scene?

---

# Part I: Path Tracing

---

> Some examples of realistic renders, maybe first some from movies or games,
> and then some of my own.
>
> Probably each gets its own slide, unless we have a nice beautiful way to do
> a gallery otherwise?

---

> Next: a bit about the theory. We imagine a piece of film in front of the
> scene and a viewer behind it: we shoot a light ray in the direction of the
> film from the point, and continue the ray into the scene until it hits
> something.
>
> When it does we pick up the color of that object and color the pixel that
> way: this is a naive "level zero" path tracer.

---

> A real path tracer bounces off the surface in some direction (controlled by
> material properties) and then continues.
>
> Show one of these rays continue around, until it hits a light source.

---

> When it hits a light source we have found a path from camera to light! We
> can then trace the light along the path, picking up color as we go.

---

> Many paths don't hit a light, and a light can be hit in many different ways,
> so a single path per pixel gives a very noisy image.
>
> But doing this thousands of times converges to a beautiful image!
>
> Perhaps my animation of frames dropping and adding as we shoot new rays?

---

> Example of this actually happening, as an image gets better and better over
> time! (Like a high quality image, whose noise is going away.)
>
> Then the next slide is the converged final version.

---

> A graph of the variance in pixels over time, showing things converging with
> sqrt(samples) ish…?

---

> This has an obvious downside: you want to make a tiny adjustment to camera
> position/angle/etc and you need to start over!

---

# Part II: The Mathematics of Photography

---

# Part III: A Crazy Idea

---

# Part IV: Implementing This
