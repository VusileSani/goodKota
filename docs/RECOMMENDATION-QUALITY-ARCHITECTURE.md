# Yagoya Recommendation & Quality Architecture

## Product invariant

**Yagoya tells you where the good food is.** Recommendation is therefore a product capability, not marketing decoration.

Yagoya should help a customer answer: **Which nearby merchant is most likely to give me a good, predictable experience now?**

## Ranking pipeline

```text
customer location
  -> bounded geospatial merchant candidate query
  -> operational eligibility / availability
  -> recommendation evidence profile
  -> quality-led ranking
  -> customer result set
```

Recommendation scoring must never trigger a full merchant collection scan. The location repository produces a bounded candidate set first; recommendation operates only on that set.

## Evidence

Verified Yagoya orders are the strongest evidence source. The initial evidence profile contains:

- verified rating count
- food quality
- overall experience quality
- low-rating rate / consistency
- confidence derived from evidence volume
- recent quality trend
- proximity

Preparation reliability, order accuracy, complaint rate and repeat-order behaviour can be added as durable operational signals once enough production data exists. The contract should be extended rather than replaced.

## Recommendation states

- `recommended` — sufficient verified evidence, healthy workflow and strong current quality
- `not_enough_evidence` — merchant may be good, but Yagoya does not yet have enough verified evidence to make the stronger claim
- `quality_concern` — active quality/watch/intervention signal; the merchant must not receive Yagoya Recommended status

The customer UI should stay restrained. Internal evidence remains auditable while customer-facing output can simply show **Yagoya Recommended** when justified.

## Commercial separation

**A merchant cannot buy Yagoya Recommended status.**

Sponsored inventory may exist in future, but must be stored and rendered separately from recommendation state and clearly identified as sponsored. Commercial spend is not an input to the recommendation score.

## Recency and predictability

Lifetime averages are not enough. Recent performance must influence the quality profile so a previously excellent merchant cannot retain recommendation confidence indefinitely after quality deteriorates.

Yagoya's quality promise is not perfection. It is predictable, monitored experience based on current evidence.

## Scale and future evolution

The initial scorer is deterministic and explainable. Do not introduce opaque machine-learning ranking until production evidence volume justifies it. If a future model is introduced, retain traceable component evidence, version the ranking policy, and preserve the ability to explain why a merchant was recommended.
