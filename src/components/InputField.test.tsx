import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { InputField } from './InputField';

describe('InputField', () => {
  it('renders input by default', () => {
    render(<InputField placeholder="Enter name" />);
    expect(screen.getByPlaceholderText('Enter name')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Enter name').tagName).toBe('INPUT');
  });

  it('renders textarea when isTextArea is true', () => {
    render(<InputField isTextArea placeholder="Enter description" />);
    expect(screen.getByPlaceholderText('Enter description')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Enter description').tagName).toBe('TEXTAREA');
  });

  it('renders label correctly', () => {
    render(<InputField label="Username" />);
    expect(screen.getByText('Username')).toBeInTheDocument();
  });

  it('renders hint correctly', () => {
    render(<InputField hint="Choose a unique name" />);
    expect(screen.getByText('Choose a unique name')).toBeInTheDocument();
  });

  it('shows loading spinner when loading is true', () => {
    const { container } = render(<InputField loading />);
    expect(container.querySelector('.spinner.tiny')).toBeInTheDocument();
  });

  it('handles onChange events', () => {
    const handleChange = vi.fn();
    render(<InputField onChange={handleChange} />);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'new value' } });
    expect(handleChange).toHaveBeenCalled();
  });

  it('handles null/undefined value by defaulting to empty string', () => {
    // @ts-ignore
    render(<InputField value={null} />);
    const input = screen.getByRole('textbox') as HTMLInputElement;
    expect(input.value).toBe('');
  });
});
