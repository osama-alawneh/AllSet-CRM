// @vitest-environment jsdom
//
// Task 13 Step 6: guards Task 10's a11y contract for SchematicMap — one <button.mpin>
// per pin, aria-label equal to the pin's label (keyboard/screen-reader users can tell
// pins apart), job pins additionally carry .mpin-job, and clicking a pin calls
// onPinClick with that exact pin object (not an index or id alone).
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { SchematicMap } from '@/components/map/SchematicMap';
import type { MapPin } from '@/lib/mapPins';

const leadPin: MapPin = { kind: 'lead', id: 1, lat: 41.66, lng: -91.53, status: 'new', label: 'Acme — New' };
const jobPin: MapPin = { kind: 'job', id: 2, lat: 41.655, lng: -91.52, status: 'unclaimed', label: 'Beta — Job: Unclaimed' };

function setup(pins: MapPin[] = [leadPin, jobPin]) {
  const onPinClick = vi.fn();
  const onMapClick = vi.fn();
  const utils = render(
    <SchematicMap
      pins={pins}
      canCreate={false}
      overlay={null}
      onMapClick={onMapClick}
      onPinClick={onPinClick}
    />
  );
  return { onPinClick, onMapClick, ...utils };
}

describe('SchematicMap pin contract (Task 10)', () => {
  it('renders one button.mpin per pin with aria-label = pin label', () => {
    const { container } = setup();
    const buttons = container.querySelectorAll('button.mpin');
    expect(buttons.length).toBe(2);
    expect(buttons[0].getAttribute('aria-label')).toBe(leadPin.label);
    expect(buttons[1].getAttribute('aria-label')).toBe(jobPin.label);
  });

  it('job pins carry .mpin-job; lead pins do not', () => {
    const { container } = setup();
    const buttons = Array.from(container.querySelectorAll('button.mpin'));
    const lead = buttons.find(b => b.getAttribute('aria-label') === leadPin.label)!;
    const job = buttons.find(b => b.getAttribute('aria-label') === jobPin.label)!;
    expect(lead.classList.contains('mpin-job')).toBe(false);
    expect(job.classList.contains('mpin-job')).toBe(true);
  });

  it('clicking a pin calls onPinClick with that pin object', () => {
    const { container, onPinClick } = setup();
    const job = Array.from(container.querySelectorAll('button.mpin'))
      .find(b => b.getAttribute('aria-label') === jobPin.label)!;
    fireEvent.click(job);
    expect(onPinClick).toHaveBeenCalledTimes(1);
    expect(onPinClick).toHaveBeenCalledWith(jobPin);
  });
});
