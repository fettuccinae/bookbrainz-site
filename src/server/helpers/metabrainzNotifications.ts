import request from 'superagent';
import log from 'log';
import config from '../../common/helpers/config';
import {cacheJSON, getCachedJSON} from '../../common/helpers/cache';

const METABRAINZ_NOTIFICATIONS_ENDPOINT = 'https://metabrainz.org/notification';
const notificationScopes = ['notification'];
const oauthConfig = config.musicbrainz;

/**
 * Fetches a valid OAuth2 access token for the MetaBrainz notification API.
 * If a cached token exists in Redis, it’s used, else a new one is requested.
 */

async function fetchToken(): Promise<string | null> {
    const cachedToken = await getCachedJSON<string>(TOKEN_CACHE_KEY);
    if (cachedToken){
        return cachedToken;
    }
    const {
        OAUTH_CLIENT_ID: clientId,
        OAUTH_CLIENT_SECRET: clientSecret,
        OAUTH_TOKEN_URL: tokenUrl
    } = config.musicbrainz;
    try{
        const res = await request
            .post(tokenUrl)
            .type('form')
            .send({
                grant_type: 'client_credentials',
                scope: notificationScopes,
                client_id: clientId,
                client_secret: clientSecret
            });

        const accessToken = res.body.access_token;
        const expiresIn = res.body.expires_in;
        await cacheJSON(TOKEN_CACHE_KEY, accessToken,{expireTime: expiresIn} );
        return accessToken
    }
    catch (error: any) {
        log.error(error);
        return null;
    }
}

/**
 * Convenience wrapper for sending a single notification.
 */
export async function sendNotification({
	musicbrainzRowId,
	userEmail,
	subject,
	body,
	templateId,
	templateParams,
	fromAddr = 'BookBrainz <noreply@bookbrainz.org>',
	project = 'bookbrainz',
	sendEmail = true,
	important = true,
	expireAge = 7
}: {
	musicbrainzRowId: number;
	userEmail: string;
	subject?: string;
	body?: string;
	templateId?: string;
	templateParams?: Record<string, any>;
	fromAddr?: string;
	project?: string;
	sendEmail?: boolean;
	important?: boolean;
	expireAge?: number;
}): Promise<void> {
	const notification = [{
		user_id: editorId,
		to: userEmail,
		subject,
		body,
		template_id: templateId,
		template_params: templateParams,
		project,
		sent_from: fromAddr,
		send_email: sendEmail,
		important,
		expire_age: expireAge
	}];

	await sendMultipleNotifications(notification);
}

/**
 * Sends multiple notifications in one request.
 */
export async function sendMultipleNotifications(notifications: Array<Record<string, any>>): Promise<void> {
	const token = await fetchToken();
	const url = `${METABRAINZ_NOTIFICATIONS_ENDPOINT}/send`;

	try {
		const res = await request
			.post(url)
			.set('Authorization', `Bearer ${token}`)
			.set('Content-Type', 'application/json')
			.send(notifications);

		if (!res.ok) {
			throw new Error(`Notification API error: ${res.status}`);
		}
	} catch (err: any) {
		log.error(error);
	}
}

