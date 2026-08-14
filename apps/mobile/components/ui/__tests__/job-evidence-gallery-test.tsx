import { fireEvent, render, screen } from '@testing-library/react-native'

jest.mock('expo-image', () => {
  const React = require('react')
  const { View } = require('react-native')
  return {
    Image: (props: unknown) => React.createElement(View, props),
  }
})

import { JobEvidenceGallery } from '../job-evidence-gallery'

describe('JobEvidenceGallery', () => {
  const refs = Array.from({ length: 5 }, (_, index) => `file:///evidence-${index + 1}.jpg`)

  it('renders every evidence image without cropping and opens any item in the viewer', () => {
    render(
      <JobEvidenceGallery
        language="vi"
        refs={refs}
        stageLabel="Ảnh hiện trạng từ khách"
        testID="evidence-gallery"
      />,
    )

    refs.forEach((_, index) => {
      expect(screen.getByTestId(`evidence-gallery-tile-${index}`)).toBeOnTheScreen()
      expect(screen.getByTestId(`evidence-gallery-image-${index}`).props.contentFit).toBe('contain')
    })

    fireEvent.press(screen.getByTestId('evidence-gallery-tile-3'))

    expect(screen.getByTestId('evidence-gallery-viewer')).toBeOnTheScreen()
    expect(screen.getByTestId('evidence-gallery-viewer-counter')).toHaveTextContent('4 / 5')
    expect(screen.getByTestId('evidence-gallery-viewer-image').props.contentFit).toBe('contain')

    fireEvent.press(screen.getByTestId('evidence-gallery-viewer-next'))
    expect(screen.getByTestId('evidence-gallery-viewer-counter')).toHaveTextContent('5 / 5')

    fireEvent.press(screen.getByTestId('evidence-gallery-viewer-zoom-in'))
    expect(screen.getByTestId('evidence-gallery-viewer-zoom-value')).toHaveTextContent('125%')
  })

  it('keeps add-photo slots separate from the read-only evidence items', () => {
    const onAddPhoto = jest.fn()
    render(
      <JobEvidenceGallery
        language="vi"
        minimumSlots={3}
        onAddPhoto={onAddPhoto}
        refs={[refs[0]]}
        stageLabel="Bằng chứng hiện trường"
        testID="field-gallery"
      />,
    )

    expect(screen.getByTestId('field-gallery-tile-0')).toBeOnTheScreen()
    expect(screen.getByTestId('field-gallery-add-1')).toBeOnTheScreen()
    expect(screen.getByTestId('field-gallery-add-2')).toBeOnTheScreen()
    expect(screen.getByTestId('field-gallery-add-mark-1')).toHaveStyle({
      alignItems: 'center',
      height: 20,
      justifyContent: 'center',
      width: 20,
    })

    fireEvent.press(screen.getByTestId('field-gallery-add-2'))
    expect(onAddPhoto).toHaveBeenCalledWith(2)
  })
})
