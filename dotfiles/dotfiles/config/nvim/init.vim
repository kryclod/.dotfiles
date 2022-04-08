" //////////////////// initial config
syntax on						                " enable syntax highlighting
set nocompatible					                " no compatible with vim
set showmatch						                " enable matching
set ignorecase						                " disable case sensitive
set mouse=v                                         			" paste with the middle click mouse (press scroll)
set hlsearch						                " highlight search
set incsearch						                " incremental search
set number						                " enable line numbers
set mouse=a						                " enable mouse clicking
set nowrap						                " disable wrap
set noswapfile						                " disable create swap file
set relativenumber							" enable relative numbers for move
set clipboard+=unnamedplus						" work with clipboard
filetype plugin indent on
syntax enable

" //////////////////// vim plug config
call plug#begin("~/.config/nvim/autoload/plugged")

" install themes
Plug 'kaicataldo/material.vim', { 'branch': 'main' }			" material theme	

" install visual tools
Plug 'itchyny/lightline.vim'						" bottom status bar

" install syntax support
Plug 'pangloss/vim-javascript'						" js syntax support
Plug 'cespare/vim-toml', { 'branch': 'main' }				" toml support

" markdown support
Plug 'lervag/vimtex'							" md
Plug 'honza/vim-snippets'
Plug 'SirVer/ultisnips'
Plug 'junegunn/goyo.vim'

call plug#end()

" markdown set up
let g:tex_flavor='latex'
let g:vimtex_view_method='zathura'
let g:vimtex_quickfix_mode=0
set conceallevel=1
let g:tex_conceal='abdmg'
let g:UltiSnipsExpandTrigger = '<tab>'
let g:UltiSnipsJumpForwardTrigger = '<tab>'
let g:UltiSnipsJumpBackwardTrigger = '<s-tab>'
let g:vimtex_view_method = 'zathura'

set spelllang=es_pe


" //////////////////// visual customization
colo material
let g:material_theme_style = 'darker'
let g:lightline = { 'colorscheme': 'material_vim' }

" //////////////////// shorcuts
let mapleader=" "

" save
nmap <leader>w :w<CR>

" quit
nmap <leader>q :q<CR>

" reload settings
nmap <leader>rr : source %<CR>

