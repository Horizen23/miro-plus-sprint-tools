import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VotingSession } from './VotingSession';

describe('VotingSession', () => {
  const mockVotingSession = {
    cardId: 'card-1',
    cardTitle: 'Test Card',
    status: 'voting' as const,
    votes: {
      'user-1': '5',
      'user-2': '3',
    },
    participants: ['user-1', 'user-2', 'user-3'],
    userNames: {
      'user-1': 'Alice',
      'user-2': 'Bob',
      'user-3': 'Charlie',
    },
  };

  const defaultProps = {
    votingSession: mockVotingSession,
    handleResetVoting: vi.fn(),
    estimateUnit: 'pt' as const,
    handleCastVote: vi.fn(),
    currentUserId: 'user-3',
    handleRevealVotes: vi.fn(),
    handleApplyVote: vi.fn(),
    onlineUsersCount: 3,
    handleRefresh: vi.fn(),
    handleVoteAgain: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders active voting session correctly', () => {
    render(<VotingSession {...defaultProps} />);
    
    expect(screen.getByText('Test Card')).toBeInTheDocument();
    expect(screen.getByText('2 Votes')).toBeInTheDocument();
    expect(screen.getByText('3 Online')).toBeInTheDocument();
    
    // Check for some voting buttons
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('13')).toBeInTheDocument();
    expect(screen.getByText('?')).toBeInTheDocument();
  });

  it('highlights current user vote', () => {
    render(<VotingSession {...defaultProps} currentUserId="user-1" />);
    
    const vote5Button = screen.getByText('5');
    expect(vote5Button).toHaveClass('active');
  });

  it('calls handleCastVote when a card is clicked', () => {
    render(<VotingSession {...defaultProps} />);
    
    fireEvent.click(screen.getByText('8'));
    expect(defaultProps.handleCastVote).toHaveBeenCalledWith('8');
  });

  it('calls handleRevealVotes when Reveal Results is clicked', () => {
    render(<VotingSession {...defaultProps} />);
    
    fireEvent.click(screen.getByText('Reveal Results'));
    expect(defaultProps.handleRevealVotes).toHaveBeenCalled();
  });

  it('renders revealed results correctly', () => {
    const revealedSession = {
      ...mockVotingSession,
      status: 'revealed' as const,
    };
    
    render(<VotingSession {...defaultProps} votingSession={revealedSession} />);
    
    expect(screen.getByText('Average')).toBeInTheDocument();
    expect(screen.getByText('4.0')).toBeInTheDocument(); // (5+3)/2
    
    expect(screen.getByText('Distribution')).toBeInTheDocument();
    expect(screen.getByText('Participants')).toBeInTheDocument();
    
    // Check Alice and Bob's votes are visible
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getAllByText('5').length).toBeGreaterThan(0);
    expect(screen.getByText('Bob')).toBeInTheDocument();
    expect(screen.getAllByText('3').length).toBeGreaterThan(0);
  });

  it('calls handleApplyVote when Apply is clicked', async () => {
    const revealedSession = {
      ...mockVotingSession,
      status: 'revealed' as const,
    };
    
    render(<VotingSession {...defaultProps} votingSession={revealedSession} />);
    
    const applyButtons = screen.getAllByText('Apply');
    fireEvent.click(applyButtons[0]);
    
    expect(defaultProps.handleApplyVote).toHaveBeenCalled();
  });

  it('changes voting options when unit is hours', () => {
    render(<VotingSession {...defaultProps} estimateUnit="h" />);
    
    expect(screen.getByText('1h')).toBeInTheDocument();
    expect(screen.getByText('8h')).toBeInTheDocument();
    expect(screen.queryByText(/^5$/)).not.toBeInTheDocument(); // Should be '5h'
  });
});
