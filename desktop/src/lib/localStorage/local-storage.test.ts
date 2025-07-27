/// <reference types="vitest/globals" />
import { OllamaLocalStorage } from './';

describe('OllamaLocalStorage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('setSelectedModel stores the model in localStorage with correct key', () => {
    OllamaLocalStorage.setSelectedModel('llama2');
    expect(localStorage.getItem('archestra-app:ollama:selectedModel')).toBe('llama2');
  });

  it('getSelectedModel retrieves the model from localStorage', () => {
    localStorage.setItem('archestra-app:ollama:selectedModel', 'phi3');
    expect(OllamaLocalStorage.getSelectedModel()).toBe('phi3');
  });
});
