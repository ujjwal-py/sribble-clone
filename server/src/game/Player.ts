import { PlayerInfo } from '../types';

export class Player {
  score = 0;

  /** Reset at the start of every turn. Used to block repeat guesses and detect "all guessed". */
  hasGuessed = false;

  constructor(
    public id: string,
    public name: string,
  ) {}

  toInfo(): PlayerInfo {
    return {
      id: this.id,
      name: this.name,
      score: this.score,
      hasGuessed: this.hasGuessed,
    };
  }
}
