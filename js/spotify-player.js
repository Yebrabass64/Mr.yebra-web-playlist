// =========================================================
// SPOTIFY PLAYER
// Mr. Yebra - Techno, House & Beyond
// =========================================================

const SPOTIFY_CLIENT_ID =
    '25bc848823fc4b17a3b82558cb4f2b2f';

const SPOTIFY_REDIRECT_URI =
    'https://yebrabass64.github.io/Mr.yebra-web-playlist/playlist.html';

const SPOTIFY_PLAYLIST_ID =
    '1rdrf0vx3g9IrVy8hKQqsR';

const SPOTIFY_SCOPES =
    'streaming user-read-email user-read-private user-modify-playback-state playlist-read-private';

const STORAGE_ACCESS_TOKEN =
    'mr_yebra_spotify_access_token';

const STORAGE_REFRESH_TOKEN =
    'mr_yebra_spotify_refresh_token';

const STORAGE_EXPIRES_AT =
    'mr_yebra_spotify_expires_at';

const STORAGE_CODE_VERIFIER =
    'mr_yebra_spotify_code_verifier';

const STORAGE_STATE =
    'mr_yebra_spotify_state';


let spotifyPlayer = null;
let spotifyDeviceId = null;
let spotifyTracks = [];
let currentTrackIndex = -1;


// =========================================================
// UTILIDADES PKCE
// =========================================================

function generateRandomString(length) {

    const characters =
        'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

    const values =
        crypto.getRandomValues(
            new Uint8Array(length)
        );

    return values.reduce(
        (result, value) =>
            result +
            characters[value % characters.length],
        ''
    );
}


async function generateCodeChallenge(codeVerifier) {

    const data =
        new TextEncoder().encode(
            codeVerifier
        );

    const digest =
        await crypto.subtle.digest(
            'SHA-256',
            data
        );

    return btoa(
        String.fromCharCode(
            ...new Uint8Array(digest)
        )
    )
        .replace(/=/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');
}


// =========================================================
// LOGIN SPOTIFY
// =========================================================

async function loginWithSpotify() {

    const codeVerifier =
        generateRandomString(64);

    const codeChallenge =
        await generateCodeChallenge(
            codeVerifier
        );

    const state =
        generateRandomString(32);

    localStorage.setItem(
        STORAGE_CODE_VERIFIER,
        codeVerifier
    );

    localStorage.setItem(
        STORAGE_STATE,
        state
    );

    const authorizationUrl =
        new URL(
            'https://accounts.spotify.com/authorize'
        );

    authorizationUrl.search =
        new URLSearchParams({

            client_id:
                SPOTIFY_CLIENT_ID,

            response_type:
                'code',

            redirect_uri:
                SPOTIFY_REDIRECT_URI,

            scope:
                SPOTIFY_SCOPES,

            state:
                state,

            code_challenge_method:
                'S256',

            code_challenge:
                codeChallenge

        }).toString();

    window.location.href =
        authorizationUrl.toString();
}


// =========================================================
// GUARDAR TOKEN
// =========================================================

function saveTokenData(data) {

    localStorage.setItem(
        STORAGE_ACCESS_TOKEN,
        data.access_token
    );

    if (data.refresh_token) {

        localStorage.setItem(
            STORAGE_REFRESH_TOKEN,
            data.refresh_token
        );
    }

    const expiresAt =
        Date.now() +
        (data.expires_in * 1000);

    localStorage.setItem(
        STORAGE_EXPIRES_AT,
        expiresAt.toString()
    );
}


// =========================================================
// OBTENER TOKEN
// =========================================================

async function exchangeCodeForToken(code) {

    const codeVerifier =
        localStorage.getItem(
            STORAGE_CODE_VERIFIER
        );

    const response =
        await fetch(
            'https://accounts.spotify.com/api/token',
            {
                method: 'POST',

                headers: {
                    'Content-Type':
                        'application/x-www-form-urlencoded'
                },

                body:
                    new URLSearchParams({

                        client_id:
                            SPOTIFY_CLIENT_ID,

                        grant_type:
                            'authorization_code',

                        code:
                            code,

                        redirect_uri:
                            SPOTIFY_REDIRECT_URI,

                        code_verifier:
                            codeVerifier

                    })
            }
        );

    if (!response.ok) {

        throw new Error(
            'No se pudo obtener el token de Spotify.'
        );
    }

    const data =
        await response.json();

    saveTokenData(data);

    localStorage.removeItem(
        STORAGE_CODE_VERIFIER
    );

    localStorage.removeItem(
        STORAGE_STATE
    );

    return data.access_token;
}


// =========================================================
// RENOVAR TOKEN
// =========================================================

async function refreshAccessToken() {

    const refreshToken =
        localStorage.getItem(
            STORAGE_REFRESH_TOKEN
        );

    if (!refreshToken) {
        return null;
    }

    const response =
        await fetch(
            'https://accounts.spotify.com/api/token',
            {
                method: 'POST',

                headers: {
                    'Content-Type':
                        'application/x-www-form-urlencoded'
                },

                body:
                    new URLSearchParams({

                        client_id:
                            SPOTIFY_CLIENT_ID,

                        grant_type:
                            'refresh_token',

                        refresh_token:
                            refreshToken

                    })
            }
        );

    if (!response.ok) {

        localStorage.removeItem(
            STORAGE_ACCESS_TOKEN
        );

        localStorage.removeItem(
            STORAGE_REFRESH_TOKEN
        );

        localStorage.removeItem(
            STORAGE_EXPIRES_AT
        );

        return null;
    }

    const data =
        await response.json();

    saveTokenData(data);

    return data.access_token;
}


// =========================================================
// TOKEN VÁLIDO
// =========================================================

async function getAccessToken() {

    const token =
        localStorage.getItem(
            STORAGE_ACCESS_TOKEN
        );

    const expiresAt =
        Number(
            localStorage.getItem(
                STORAGE_EXPIRES_AT
            )
        );

    if (
        token &&
        expiresAt &&
        Date.now() < expiresAt - 60000
    ) {

        return token;
    }

    return await refreshAccessToken();
}


// =========================================================
// PETICIONES A SPOTIFY
// =========================================================

async function spotifyFetch(
    url,
    options = {}
) {

    let token =
        await getAccessToken();

    if (!token) {

        throw new Error(
            'No hay una sesión activa de Spotify.'
        );
    }

    let response =
        await fetch(
            url,
            {
                ...options,

                headers: {

                    ...(options.headers || {}),

                    Authorization:
                        `Bearer ${token}`

                }
            }
        );

    if (response.status === 401) {

        token =
            await refreshAccessToken();

        if (!token) {

            throw new Error(
                'La sesión de Spotify ha caducado.'
            );
        }

        response =
            await fetch(
                url,
                {
                    ...options,

                    headers: {

                        ...(options.headers || {}),

                        Authorization:
                            `Bearer ${token}`

                    }
                }
            );
    }

    return response;
}


// =========================================================
// CARGAR PLAYLIST
// =========================================================

async function loadSpotifyPlaylist() {

    const response =
        await spotifyFetch(
            `https://api.spotify.com/v1/playlists/${SPOTIFY_PLAYLIST_ID}?market=ES`
        );

    if (!response.ok) {

        throw new Error(
            'No se pudo cargar la playlist.'
        );
    }

    const playlist =
        await response.json();

    spotifyTracks = [];

    let offset = 0;
    let total = 0;

    do {

        const tracksResponse =
            await spotifyFetch(
                `https://api.spotify.com/v1/playlists/${SPOTIFY_PLAYLIST_ID}/items?market=ES&limit=50&offset=${offset}`
            );

        if (!tracksResponse.ok) {

            throw new Error(
                'No se pudieron cargar las canciones.'
            );
        }

        const data =
            await tracksResponse.json();

        total =
            data.total;

        data.items.forEach(
            item => {

                if (
                    item.item &&
                    item.item.type === 'track'
                ) {

                    spotifyTracks.push(
                        item.item
                    );
                }
            }
        );

        offset +=
            data.items.length;

    } while (
        offset < total
    );

    return playlist;
}


// =========================================================
// CREAR REPRODUCTOR SPOTIFY
// =========================================================

function createSpotifyPlayer() {

    if (spotifyPlayer) {
        return;
    }

    if (
        typeof Spotify === 'undefined'
    ) {

        console.error(
            'Spotify Web Playback SDK todavía no está cargado.'
        );

        return;
    }

    spotifyPlayer =
        new Spotify.Player({

            name:
                'Mr. Yebra Playlist Player',

            volume:
                0.8,

            getOAuthToken:
                async callback => {

                    const token =
                        await getAccessToken();

                    callback(token);
                },

            enableMediaSession:
                true
        });


    // -------------------------------------------------------
    // PLAYER READY
    // -------------------------------------------------------

    spotifyPlayer.addListener(
        'ready',
        ({ device_id }) => {

            spotifyDeviceId =
                device_id;

            console.log(
                'Spotify Player listo:',
                device_id
            );

            if (
                window.onSpotifyPlayerReady
            ) {

                window.onSpotifyPlayerReady();
            }
        }
    );


    // -------------------------------------------------------
    // PLAYER NOT READY
    // -------------------------------------------------------

    spotifyPlayer.addListener(
        'not_ready',
        ({ device_id }) => {

            console.log(
                'Spotify Player desconectado:',
                device_id
            );

            if (
                spotifyDeviceId === device_id
            ) {

                spotifyDeviceId =
                    null;
            }
        }
    );


    // -------------------------------------------------------
    // CAMBIO DE CANCIÓN
    // -------------------------------------------------------

    spotifyPlayer.addListener(
        'player_state_changed',
        state => {

            if (!state) {
                return;
            }

            const track =
                state.track_window.current_track;

            if (!track) {
                return;
            }

            console.log(
                'Reproduciendo:',
                track.name
            );

            if (
                window.onSpotifyTrackChanged
            ) {

                window.onSpotifyTrackChanged(
                    state
                );
            }
        }
    );


    // -------------------------------------------------------
    // ERRORES
    // -------------------------------------------------------

    spotifyPlayer.addListener(
        'initialization_error',
        ({ message }) => {

            console.error(
                'Error de inicialización:',
                message
            );
        }
    );


    spotifyPlayer.addListener(
        'authentication_error',
        ({ message }) => {

            console.error(
                'Error de autenticación:',
                message
            );
        }
    );


    spotifyPlayer.addListener(
        'account_error',
        ({ message }) => {

            console.error(
                'Error de cuenta Spotify:',
                message
            );
        }
    );


    spotifyPlayer.addListener(
        'playback_error',
        ({ message }) => {

            console.error(
                'Error de reproducción:',
                message
            );
        }
    );


    spotifyPlayer.addListener(
        'autoplay_failed',
        () => {

            console.log(
                'El navegador requiere una interacción del usuario.'
            );
        }
    );


    // -------------------------------------------------------
    // CONECTAR
    // -------------------------------------------------------

    spotifyPlayer.connect();
}


// =========================================================
// CALLBACK OBLIGATORIO DEL SPOTIFY WEB PLAYBACK SDK
// =========================================================

window.onSpotifyWebPlaybackSDKReady =
    () => {

        console.log(
            'Spotify Web Playback SDK cargado.'
        );

        if (
            window.onSpotifySDKReady
        ) {

            window.onSpotifySDKReady();
        }
    };


// =========================================================
// REPRODUCIR CANCIÓN
// =========================================================

async function playSpotifyTrack(index) {

    if (
        !spotifyTracks[index]
    ) {

        return;
    }

    if (
        !spotifyDeviceId
    ) {

        console.error(
            'El reproductor de Spotify todavía no está listo.'
        );

        return;
    }

    const track =
        spotifyTracks[index];

    const token =
        await getAccessToken();

    if (!token) {
        return;
    }

    currentTrackIndex =
        index;


    // Transferir reproducción al reproductor de nuestra web
    const transferResponse =
        await fetch(
            'https://api.spotify.com/v1/me/player',
            {
                method: 'PUT',

                headers: {

                    Authorization:
                        `Bearer ${token}`,

                    'Content-Type':
                        'application/json'

                },

                body:
                    JSON.stringify({

                        device_ids:
                            [spotifyDeviceId],

                        play:
                            false

                    })
            }
        );


    if (
        !transferResponse.ok &&
        transferResponse.status !== 204
    ) {

        console.error(
            'No se pudo transferir la reproducción al reproductor web.'
        );
    }


    // Reproducir la canción seleccionada
    const playResponse =
        await fetch(
            `https://api.spotify.com/v1/me/player/play?device_id=${encodeURIComponent(spotifyDeviceId)}`,
            {
                method: 'PUT',

                headers: {

                    Authorization:
                        `Bearer ${token}`,

                    'Content-Type':
                        'application/json'

                },

                body:
                    JSON.stringify({

                        uris:
                            [track.uri]

                    })
                }
            );


    if (
        !playResponse.ok
    ) {

        const errorText =
            await playResponse.text();

        console.error(
            'Error al reproducir:',
            errorText
        );

        return;
    }

    console.log(
        'Reproduciendo:',
        track.name
    );
}


// =========================================================
// PAUSAR / CONTINUAR
// =========================================================

async function toggleSpotifyPlayback() {

    if (!spotifyPlayer) {
        return;
    }

    const state =
        await spotifyPlayer.getCurrentState();

    if (!state) {
        return;
    }

    if (state.paused) {

        await spotifyPlayer.resume();

    } else {

        await spotifyPlayer.pause();
    }
}


// =========================================================
// SIGUIENTE
// =========================================================

async function nextSpotifyTrack() {

    if (
        currentTrackIndex <
        spotifyTracks.length - 1
    ) {

        await playSpotifyTrack(
            currentTrackIndex + 1
        );
    }
}


// =========================================================
// ANTERIOR
// =========================================================

async function previousSpotifyTrack() {

    if (
        currentTrackIndex > 0
    ) {

        await playSpotifyTrack(
            currentTrackIndex - 1
        );
    }
}


// =========================================================
// EXPONER FUNCIONES
// =========================================================

window.MrYebraSpotify = {

    login:
        loginWithSpotify,

    getToken:
        getAccessToken,

    loadPlaylist:
        loadSpotifyPlaylist,

    createPlayer:
        createSpotifyPlayer,

    play:
        playSpotifyTrack,

    toggle:
        toggleSpotifyPlayback,

    next:
        nextSpotifyTrack,

    previous:
        previousSpotifyTrack,

    getTracks:
        () =>
            spotifyTracks,

    getPlayer:
        () =>
            spotifyPlayer

};
