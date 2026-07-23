# Job Evidence Gallery Contract

Status: accepted production direction for Customer and Worker Jobs evidence.

## Privacy stages

- Until the Customer confirms the proposed Worker, Worker surfaces may show only the customer media count and Kael's text brief, including the waiting state after the Worker accepts.
- No storage reference, signed URL, thumbnail, or original image bytes may cross the broadcast response.
- After Customer confirmation, authorized Worker job responses may expose private storage references for rendering through short-lived signed URLs. Customers retain access to the evidence they own.

## Visual contract

- Evidence thumbnails use a stable `4:3` frame.
- Images always use `contain`; evidence must never be cropped to fill a tile.
- Neutral empty space is acceptable when the source aspect ratio differs from `4:3`.
- Every available image is rendered. Do not collapse the final tile into a `+N` placeholder.
- Selecting any thumbnail opens a full-screen `contain` viewer with previous, next, close, zoom-in, and zoom-out controls.

## Evidence stages

Keep these sources visibly separate:

1. Customer condition photos.
2. Worker on-site photos.
3. Scope-change evidence.
4. Completion photos.

Do not merge customer evidence into worker field evidence in the shared workflow model.

## Accessibility and performance

- Every thumbnail and viewer control has a localized accessibility label and button role.
- Viewer entrance respects Reduce Motion.
- Evidence uses one shared image/gallery implementation and private signed previews; repeated tiles do not add blur layers.
