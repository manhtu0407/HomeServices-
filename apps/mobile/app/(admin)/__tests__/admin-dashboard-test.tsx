import AdminDashboardRoute from '../dashboard'
import AdminSectionsRoute from '../sections'

describe('Admin dashboard compatibility route', () => {
  it('uses the current admin sections route', () => {
    expect(AdminDashboardRoute).toBe(AdminSectionsRoute)
  })
})
