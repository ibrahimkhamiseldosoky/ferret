'use client';
import { useEffect } from 'react';

const scrollbarCSS = `
.custom-scroll-viewport{scrollbar-width:none!important;-ms-overflow-style:none!important}
.custom-scroll-viewport::-webkit-scrollbar{width:0!important;height:0!important;display:none!important}
.chat-scroll-area{scrollbar-width:thin!important;scrollbar-color:#a1a1aa transparent!important}
.chat-scroll-area::-webkit-scrollbar{width:4px!important;height:4px!important;background:transparent!important}
.chat-scroll-area::-webkit-scrollbar-track{background:transparent!important;margin:0!important;padding:0!important}
.chat-scroll-area::-webkit-scrollbar-thumb{background:#a1a1aa!important;border-radius:4px!important;min-height:20px!important}
.chat-scroll-area::-webkit-scrollbar-thumb:hover{background:#8a8a92!important}
.chat-scroll-area::-webkit-scrollbar-button,
.chat-scroll-area::-webkit-scrollbar-button:single-button,
.chat-scroll-area::-webkit-scrollbar-button:vertical,
.chat-scroll-area::-webkit-scrollbar-button:horizontal,
.chat-scroll-area::-webkit-scrollbar-button:vertical:start:decrement,
.chat-scroll-area::-webkit-scrollbar-button:vertical:end:increment,
.chat-scroll-area::-webkit-scrollbar-button:horizontal:start:decrement,
.chat-scroll-area::-webkit-scrollbar-button:horizontal:end:increment{
  width:0!important;
  height:0!important;
  min-width:0!important;
  min-height:0!important;
  padding:0!important;
  margin:0!important;
  border:0!important;
  display:none!important;
  background:transparent!important;
  background-image:none!important;
}
.chat-scroll-area::-webkit-scrollbar-corner{background:transparent!important;display:none!important}
`;

export default function ScrollbarStyles() {
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = scrollbarCSS;
    document.head.appendChild(style);
  }, []);
  return null;
}
