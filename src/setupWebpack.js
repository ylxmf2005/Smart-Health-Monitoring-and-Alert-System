import { Buffer } from 'buffer';
import process from 'process/browser';

window.Buffer = Buffer;

window.process = process; 