import './styles/global.css';
import './styles/layout.css';
import './styles/components.css';
import { startRouter } from './lib/router.js';

const app = document.querySelector('#app');

startRouter(app);
