import { connect, type Config } from '@planetscale/database';
// Visit planetscale to get these, place them in your .env
import { DATABASE_HOST, DATABASE_USERNAME, DATABASE_PASSWORD } from '$env/static/private';
import type {
	Adapter,
	AdapterUser,
	AdapterAccount,
	AdapterSession,
	VerificationToken
} from '@auth/core/adapters';

import SqlString from '$lib/server/utils/sqlstring';
import { snakeCaseFlatObject } from '$lib/utils/utils';

const defaultConfig = {
	format: SqlString.format, // this may be removed or replaced, it allows for mysql2 type query formatting
	host: DATABASE_HOST,
	username: DATABASE_USERNAME,
	password: DATABASE_PASSWORD
};

export function PlanetScaleAdapter(config: Config = defaultConfig): Adapter {
	const conn = connect(config);

	return {
		async createUser(user: Omit<AdapterUser, 'id'>): Promise<AdapterUser> {
			const snakeCaseUser = snakeCaseFlatObject(user);

			const insertUserResult = await conn.execute('INSERT INTO users SET ?', snakeCaseUser);
			const id = insertUserResult && insertUserResult.insertId;
			return { ...user, id: id.toString() };
		},

		async getUser(id: string): Promise<AdapterUser | null> {
			const { rows } = await conn.execute('SELECT * FROM users WHERE id = ? LIMIT 1', [id]);
			const user = rows[0];
			return (user as AdapterUser) || null;
		},

		async getUserByAccount({ provider, providerAccountId }): Promise<AdapterUser | null> {
			const { rows } = await conn.execute(
				'SELECT u.* FROM users u JOIN accounts a ON u.id = a.user_id WHERE a.provider = ? AND a.provider_account_id = ?',
				[provider, providerAccountId]
			);

			const user = rows[0];
			return (user as AdapterUser) || null;
		},

		async updateUser(user: Partial<AdapterUser>): Promise<AdapterUser> {
			await conn.execute('UPDATE users SET ? WHERE id = ?', [user, user.id]);
			const { rows } = await conn.execute('SELECT * FROM users WHERE id = ?', [user.id]);
			const updatedUser = rows[0];
			return (updatedUser as AdapterUser) || null;
		},

		async linkAccount(account: AdapterAccount): Promise<void> {
			const { provider, userId, type, providerAccountId, access_token, refresh_token, expires_in } =
				account;

			// NOTE: unser we need all of these properties and should probably investagte for security reasons
			const accountRecord = {
				user_id: userId,
				provider,
				type,
				provider_account_id: providerAccountId,
				access_token,
				refresh_token,
				expires_in
			};

			const result = await conn.execute('INSERT INTO accounts SET ?', [accountRecord]);
			console.log({ success: result.insertId }, 'ACCOUNT INSERTED');
		},

		async createSession(session: {
			sessionToken: string;
			userId: string;
			expires: Date;
		}): Promise<AdapterSession> {
			const result = await conn.execute('INSERT INTO sessions SET ?', snakeCaseFlatObject(session));
			console.log({ result: result.insertId }, 'SESSION INSERTED');

			return session;
		},

		async updateSession(
			session: Partial<AdapterSession> & Pick<AdapterSession, 'sessionToken'>
		): Promise<AdapterSession | null> {
			await conn.execute('UPDATE sessions SET ? WHERE session_token = ?', [
				snakeCaseFlatObject(session),
				session.sessionToken
			]);
			const { rows } = await conn.execute('SELECT * FROM sessions WHERE session_token = ?', [
				session.sessionToken
			]);
			const updatedSession = rows[0];
			return (updatedSession as AdapterSession) || null;
		},

		async deleteSession(sessionToken: string): Promise<void> {
			await conn.execute('DELETE FROM sessions WHERE session_token = ?', [sessionToken]);
		},

		async createVerificationToken(
			verificationToken: VerificationToken
		): Promise<VerificationToken | null> {
			// No uidea why this was throwing an AdapterAccount[] error
			await conn.execute('INSERT INTO verification_tokens SET ?', { ...verificationToken });
			return verificationToken;
		},

		async useVerificationToken({ identifier, token }): Promise<VerificationToken | null> {
			const { rows } = await conn.execute(
				'SELECT * FROM verification_tokens WHERE identifier = ? AND token = ?',
				[identifier, token]
			);
			const verificationToken = rows[0];

			if (!verificationToken) {
				return null;
			}

			await conn.execute('DELETE FROM verification_tokens WHERE identifier = ? AND token = ?', [
				identifier,
				token
			]);
			return (verificationToken as VerificationToken) || null;
		},

		async getUserByEmail(email: string): Promise<AdapterUser | null> {
			const { rows } = await conn.execute('SELECT * FROM users WHERE email = ? LIMIT 1', [email]);
			const user = rows[0];
			return (user as AdapterUser) || null;
		},

		async getSessionAndUser(
			sessionToken: string
		): Promise<{ session: AdapterSession; user: AdapterUser } | null> {
			if (!sessionToken) {
				console.log('debug:  no SESSION TOKEN within getSessionAndUser');
			}
			const { rows } = await conn.execute('SELECT * FROM sessions WHERE session_token = ?', [
				sessionToken
			]);

			const session = rows && rows.length > 0 ? rows[0] : undefined;

			console.log({ session }, 'session from getSessionAndUser()');
			if (!session) {
				return null;
			}

			const userResult = await conn.execute('SELECT * FROM users WHERE id = ?', [
				(session as Record<string, string>).user_id
			]);
			const user = userResult.rows[0];

			if (!user) {
				return null;
			}

			const adaptedSession = { ...session, expires: new Date((session as AdapterSession).expires) };
			return { session: adaptedSession as AdapterSession, user: user as AdapterUser };
		}
	};
}
