import {
  createDockScrollState,
  resolveDockScrollState,
} from '../dock-scroll-state-model'

describe('dock scroll state', () => {
  it('collapses after a deliberate downward scroll and expands after an upward scroll', () => {
    let state = createDockScrollState()

    state = resolveDockScrollState(state, 8)
    expect(state.collapsed).toBe(false)

    state = resolveDockScrollState(state, 24)
    expect(state.collapsed).toBe(true)

    state = resolveDockScrollState(state, 16)
    expect(state.collapsed).toBe(true)

    state = resolveDockScrollState(state, 3)
    expect(state.collapsed).toBe(false)
  })

  it('always restores the full dock when the content returns to the top', () => {
    const collapsed = resolveDockScrollState(createDockScrollState(), 24)

    expect(resolveDockScrollState(collapsed, 0)).toMatchObject({ collapsed: false })
  })
})
