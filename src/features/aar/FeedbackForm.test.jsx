import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FeedbackForm } from './FeedbackForm';

const create = vi.fn();
vi.mock('@/api/db', () => ({ db: { feedback: { create: (...args) => create(...args) } } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const deployment = { id: 'd1', name: 'PAM 2027' };
const user = { id: 'u1' };
const wrap = (ui) => render(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);

describe('FeedbackForm', () => {
  beforeEach(() => create.mockReset().mockResolvedValue({ id: 'f1' }));

  it('shows the thank-you state when the user already answered', () => {
    wrap(<FeedbackForm deployment={deployment} user={user} existing={{ id: 'f0' }} />);
    expect(screen.getByText(/your feedback for PAM 2027 is recorded/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /send feedback/i })).not.toBeInTheDocument();
  });

  it('submits a signed response with the assignment attached', async () => {
    wrap(<FeedbackForm deployment={deployment} user={user} assignmentId="a1" />);
    fireEvent.click(screen.getByRole('radio', { name: '4 of 5' }));
    fireEvent.click(screen.getByRole('button', { name: 'Partly' }));
    fireEvent.change(screen.getByLabelText('One thing to change next time'), { target: { value: ' Earlier muster ' } });
    fireEvent.click(screen.getByRole('button', { name: /send feedback/i }));
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    expect(create.mock.calls[0][0]).toMatchObject({ deployment_id: 'd1', assignment_id: 'a1', user_id: 'u1', anonymous: false, rating: 4, comms_worked: 'partly', one_change: 'Earlier muster', went_well: null });
    expect(await screen.findByText(/your feedback for PAM 2027 is recorded/i)).toBeInTheDocument();
  });

  it('strips user and assignment when sent anonymously', async () => {
    wrap(<FeedbackForm deployment={deployment} user={user} assignmentId="a1" />);
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: /send feedback/i }));
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    expect(create.mock.calls[0][0]).toMatchObject({ anonymous: true, user_id: null, assignment_id: null });
  });
});
