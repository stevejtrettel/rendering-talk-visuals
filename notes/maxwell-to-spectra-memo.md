# Memo: Fourier-transforming a Maxwell solution to get directions and wavelengths

For Part I (Modeling Light), §8–§9. Findings graded VERIFIED (checked against a
cited source), DERIVED (worked out here, checkable, no citation needed),
ASSERTED (believed correct, no source consulted).

---

## 1. The derivation

**[DERIVED] Step 1 — support on the light cone.** Source-free Maxwell in all of
$\mathbb R^3$. Each Cartesian component satisfies the wave equation, so with
$\varpi$ the angular frequency the spacetime Fourier transform obeys

$$\left(c^{2}\lvert\mathbf k\rvert^{2}-\varpi^{2}\right)\widehat{\mathbf E}(\mathbf k,\varpi)=0 .$$

Sharper than "supported on the cone": if $P$ is smooth with $dP\neq0$ on
$P^{-1}(0)$, the distributional solutions of $Pu=0$ are exactly $u=a\,\delta(P)$
with $a$ a distribution on the surface. No transverse derivatives are admitted,
since $x\delta'=-\delta\neq0$. Hence

$$\widehat{\mathbf E}=\mathbf a\,\delta\!\left(c^{2}\lvert\mathbf k\rvert^{2}-\varpi^{2}\right).$$

The cone vertex $\mathbf k=0$ is the one place $dP=0$, and it is exactly where the
static solutions live. Discard it.

**[VERIFIED, standard] Step 2 — reality.** $\mathbf E$ real gives
$\widehat{\mathbf E}(-\mathbf k,-\varpi)=\overline{\widehat{\mathbf E}(\mathbf k,\varpi)}$,
so the negative-frequency sheet is redundant; keep the forward sheet. This is the
*analytic signal* of coherence theory (Gabor; Mandel & Wolf Ch. 3).

**[DERIVED] Step 3 — the rest of Maxwell adds nothing new.** Gauss gives
$\mathbf k\cdot\widehat{\mathbf E}=0$; Faraday gives
$\widehat{\mathbf B}=(\mathbf k\times\widehat{\mathbf E})/\varpi$, so $\mathbf B$
carries no independent data; and Ampère, after substituting and using
transversality via $\mathbf k\times(\mathbf k\times\widehat{\mathbf E})=-\lvert\mathbf k\rvert^{2}\widehat{\mathbf E}$,
returns $\varpi^{2}=c^{2}\lvert\mathbf k\rvert^{2}$ — the dispersion relation
again. The whole system is one transverse amplitude on the forward cone.

**[DERIVED] Step 4 — the cone is directions times wavelengths.** With
$\mathbf k=(2\pi/\lambda)\,\omega$, $\omega\in\mathbb S^{2}$, $\lambda>0$:

$$C_{+}=\left\{(\mathbf k,c\lvert\mathbf k\rvert):\mathbf k\neq0\right\}\cong\mathbb R^{3}\setminus\{0\}\cong\mathbb S^{2}\times\Lambda .$$

This is the payoff: $\mathbb S^2$ and $\Lambda$ come out of one computation.

**[DERIVED] Step 5 — the leftover fibre is polarisation.** The amplitude lies in
$\omega^{\perp}\otimes\mathbb C\cong\mathbb C^{2}$. The real bundle
$\omega\mapsto\omega^{\perp}$ over $\mathbb S^{2}$ is $T\mathbb S^{2}$. §7's
"unpolarised" assumption keeps the trace of the Hermitian form on this fibre and
discards the Stokes data.

**[DERIVED] Hairy-ball remark, stated correctly.** $T\mathbb S^{2}$ has Euler
number 2, so there is no globally continuous choice of *real orthonormal*
polarisation axes over the sphere of directions. Do NOT state the complex
analogue: $T\mathbb S^{2}\otimes\mathbb C=\mathcal O(2)\oplus\mathcal O(-2)$ has
$c_{1}=0$ and rank-2 complex bundles over $S^{2}$ are classified by $c_{1}$, so
the complexified bundle IS topologically trivial.

---

## 2. The fork: why transforming the field cannot give spectral lines

**[DERIVED] Route A — finite-energy fields.** Plancherel turns the field energy
into an integral of $\lvert\mathbf a\rvert^{2}$ over the cone, giving a finite
positive measure on $\mathbb S^{2}\times\Lambda$. But $\mathbf a\in L^{2}$, so
that measure is always absolutely continuous, and a monochromatic wave has
infinite energy and is not in the class. **Transforming the field can never
produce an atom.** This is the precise defect of the naive "spectrum = Fourier
transform of the wave" story.

**[VERIFIED] Route B — stationary random fields.** Incoherence means wide-sense
stationarity, so transform the correlation rather than the field:

$$\Gamma(\tau)=\mathbb E\!\left[\mathbf E(t)\cdot\overline{\mathbf E(t+\tau)}\right].$$

$\Gamma$ is positive-definite, and Bochner–Khintchine gives a finite positive
Borel measure whose transform it is. (Standard; see Doob, or Cramér & Leadbetter,
or Ibragimov & Linnik — all cited for exactly this statement in the survey
arXiv:2102.00343 §2.1.2.) That measure is the spectrum:

- positivity is free, from positive-definiteness;
- total mass $\Gamma(0)$ is the mean intensity;
- an atom at $\lambda_{0}$ is a non-decaying periodic component of $\Gamma$; an
  absolutely continuous part is a decaying one, by Riemann–Lebesgue.

So §8's $s(d\lambda)=f(\lambda)\,d\lambda+\sum_k c_k\delta_{\lambda_k}(d\lambda)$
is derived, not posited. **Answer to "is a distribution the right object?": no.**
A distribution is what you get by transforming the field, and it is wrong because
you then have to square it. Transform the correlation and nothing is squared.

**[VERIFIED] Spatially resolved version.** Wolf's space–frequency theory: the
cross-spectral density $W(\mathbf r_1,\mathbf r_2,\nu)$ is the temporal transform
of the mutual coherence function, is a nonnegative-definite kernel, and by Mercer
has the coherent-mode expansion
$W=\sum_j\beta_j(\nu)\overline{E_j(\mathbf r_1,\nu)}E_j(\mathbf r_2,\nu)$ with
$\beta_j\geq0$, so $S(\mathbf r,\nu)=W(\mathbf r,\mathbf r,\nu)\geq0$.

---

## 3. The limitation — do not overclaim past this

**[VERIFIED] The plane-wave decomposition has no position dependence.** It gives a
measure on $\mathbb S^{2}\times\Lambda$ for the whole field, not on
$T^{1}M\times\Lambda$. Localising and decomposing into plane waves do not commute.

**[VERIFIED] Walther's generalised radiance is not a measure.** The classical
attempt to localise is Walther (1968), a Wigner-type transform of the
cross-spectral density. Marchand & Wolf (1974) state that both the generalised
radiance and the generalised radiant emittance may take negative values, and that
this is why they have a less direct physical meaning than the traditional
radiometric quantities. The generalised radiant *intensity* is however always
nonnegative.

**[VERIFIED] Radiance is recovered only in a limit.** Kim & Wolf (1987): for
quasi-homogeneous sources at sufficiently short wavelength, Walther's first
generalised radiance acquires all the properties of traditional radiance. The
general PDE statement is Ryzhik–Papanicolaou–Keller (1996), deriving radiative
transport as a Wigner-transform limit of wave equations — same family as the
Papanicolaou–Bal–Ryzhik entry already in the bibliography.

**Talk-safe sentence:** geometric optics is the high-frequency, incoherent limit
of Maxwell, and positivity is restored in the limit, not before it.

---

## 4. Notation hazard

Physics writes $\omega$ for angular frequency; §6 reserves $\omega$ for direction
of travel. Use $\nu$ for frequency, $\lambda$ for wavelength, and write $2\pi\nu$
wherever angular frequency is genuinely needed. In this memo $\varpi$ is used for
angular frequency to keep the two apart on the page.

---

## 5. Optional free payoff — measure versus density under reparametrisation

**[VERIFIED]** The Fourier variable is frequency, $\Lambda$ is labelled by
wavelength, $\nu=c/\lambda$. A measure pushes forward; a density picks up
$\lvert d\nu/d\lambda\rvert=c/\lambda^{2}$. Wien's displacement law accordingly has
two constants, $2898\ \mu\mathrm m\!\cdot\!\mathrm K$ per unit wavelength and
$5.879\times10^{10}\ \mathrm{Hz/K}$ per unit frequency, so for $T\approx5778\,$K
the solar spectrum "peaks" at about 500 nm or about 880 nm depending only on which
density was plotted. Same light, two densities, one measure. A one-line argument
that the measure is the real object.

---

## 6. Bibliography additions

Formatted for the build document's Literature section.

- [**Walther** (1968), *Radiometry and Coherence*](https://opg.optica.org/josa/abstract.cfm?uri=josa-58-9-1256) — JOSA **58**, 1256–1259. The generalised radiance: the first attempt to localise a coherence function into a radiance.
- [**Marchand & Wolf** (1974), *Radiometry with sources of any state of coherence*](https://opg.optica.org/josa/abstract.cfm?uri=josa-64-9-1219) — JOSA **64**, 1219–1226. The generalised radiance can be negative; the generalised radiant intensity cannot. This is the citation for why the wave-optical object is not a measure.
- [**Kim & Wolf** (1987), *Propagation law for Walther's first generalised radiance function and its short-wavelength limit with quasi-homogeneous sources*](https://opg.optica.org/josaa/abstract.cfm?uri=josaa-4-7-1233) — JOSA A **4**, 1233–1236. Where traditional radiance is recovered.
- **Wolf** (1982), *New theory of partial coherence in the space–frequency domain. Part I: Spectra and cross spectra of steady-state sources* — JOSA **72**, 343–351. The cross-spectral density and its nonnegative-definiteness.
- **Mandel & Wolf** (1995), *Optical Coherence and Quantum Optics*, CUP. Analytic signal, mutual coherence function, Wiener–Khinchin, coherent-mode representation. <!-- no open link; book -->
- **Ryzhik, Papanicolaou & Keller** (1996), *Transport equations for elastic and other waves in random media* — Wave Motion **24**, 327–370. Radiative transport as the Wigner-transform limit of wave equations; the rigorous form of "geometric optics is a limit of Maxwell".
- **Bochner–Khintchine** — the spectral measure of a wide-sense-stationary process. Standard; Doob, *Stochastic Processes*, or Cramér & Leadbetter. <!-- no open link; book -->
