import { describe, expect, it } from 'vitest'
import {
  clampMarketPriceToBaseline,
  synthesizePrice,
} from '../../../../../supabase/functions/mobile-api/_shared/kael/synthesis'

describe('Kael deterministic price synthesis', () => {
  it('locks the live medium-complexity blend at 50% baseline and 50% market', () => {
    expect(synthesizePrice({
      baselineMin: 100_000,
      baselineMax: 200_000,
      market: {
        market_range_min: 200_000,
        market_range_max: 400_000,
        confidence: 0.8,
      },
      complexityHint: 'medium',
    })).toEqual({
      price_min: 150_000,
      price_max: 300_000,
      confidence: 0.65,
    })
  })

  it('widens a deterministic 50/50 band and lowers confidence when inspection is required', () => {
    expect(synthesizePrice({
      baselineMin: 100_000,
      baselineMax: 200_000,
      market: {
        market_range_min: 200_000,
        market_range_max: 400_000,
        confidence: 0.8,
      },
      complexityHint: 'medium',
      needsInspection: true,
    })).toEqual({
      price_min: 128_000,
      price_max: 345_000,
      confidence: 0.44,
    })
  })

  it('keeps a valid market correction within the four-times baseline clamp', () => {
    const market = {
      market_range_min: 400_000,
      market_range_max: 800_000,
      confidence: 0.8,
    }

    expect(clampMarketPriceToBaseline(market, {
      priceMin: 100_000,
      priceMax: 200_000,
    })).toEqual(market)
  })

  it('drops a pathological market range and falls back to the deterministic baseline', () => {
    const market = {
      market_range_min: 401_000,
      market_range_max: 801_000,
      confidence: 0.8,
    }

    expect(clampMarketPriceToBaseline(market, {
      priceMin: 100_000,
      priceMax: 200_000,
    })).toBeNull()
    expect(synthesizePrice({
      baselineMin: 100_000,
      baselineMax: 200_000,
      market,
      complexityHint: 'medium',
    })).toEqual({
      price_min: 100_000,
      price_max: 200_000,
      confidence: 0.4,
    })
  })
})
