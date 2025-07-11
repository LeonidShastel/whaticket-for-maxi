import React, {useState, useEffect, useReducer, useContext} from "react";
import openSocket from "../../services/socket-io";

import {makeStyles} from "@material-ui/core/styles";
import List from "@material-ui/core/List";
import Paper from "@material-ui/core/Paper";

import TicketListItem from "../TicketListItem";
import TicketsListSkeleton from "../TicketsListSkeleton";

import useTickets from "../../hooks/useTickets";
import {i18n} from "../../translate/i18n";
import {AuthContext} from "../../context/Auth/AuthContext";

const useStyles = makeStyles(theme => ({
	ticketsListWrapper: {
		position: "relative",
		display: "flex",
		height: "100%",
		flexDirection: "column",
		overflow: "hidden",
		borderTopRightRadius: 0,
		borderBottomRightRadius: 0,
	},

	ticketsList: {
		flex: 1,
		overflowY: "scroll",
		...theme.scrollbarStyles,
		borderTop: "2px solid rgba(0, 0, 0, 0.12)",
	},

	ticketsListHeader: {
		color: "rgb(67, 83, 105)",
		zIndex: 2,
		backgroundColor: "white",
		borderBottom: "1px solid rgba(0, 0, 0, 0.12)",
		display: "flex",
		alignItems: "center",
		justifyContent: "space-between",
	},

	ticketsCount: {
		fontWeight: "normal",
		color: "rgb(104, 121, 146)",
		marginLeft: "8px",
		fontSize: "14px",
	},

	noTicketsText: {
		textAlign: "center",
		color: "rgb(104, 121, 146)",
		fontSize: "14px",
		lineHeight: "1.4",
	},

	noTicketsTitle: {
		textAlign: "center",
		fontSize: "16px",
		fontWeight: "600",
		margin: "0px",
	},

	noTicketsDiv: {
		display: "flex",
		height: "100px",
		margin: 40,
		flexDirection: "column",
		alignItems: "center",
		justifyContent: "center",
	},
}));

const reducer = (state, action) => {
	if (action.type === "LOAD_TICKETS") {
		const incoming = action.payload;
		const whatsappId = action.whatsappId;

		const newTickets = whatsappId ?
			incoming.filter(ticket => ticket.whatsappId === whatsappId) :
			incoming;

		newTickets.forEach(ticket => {
			const ticketIndex = state.findIndex(t => t.id === ticket.id);
			if (ticketIndex !== -1) {
				state[ticketIndex] = ticket;
				if (ticket.unreadMessages > 0) {
					state.unshift(state.splice(ticketIndex, 1)[0]);
				}
			} else {
				state.push(ticket);
			}
		});

		return [...state];
	}

	if (action.type === "RESET_UNREAD") {
		const ticketId = action.payload;

		const ticketIndex = state.findIndex(t => t.id === ticketId);
		if (ticketIndex !== -1) {
			state[ticketIndex].unreadMessages = 0;
		} else {
			const candidate = action.tickets.find(t => t.id === ticketId);
			if (candidate) {
				candidate.unreadMessages = 0;
				action.setTickets([...action.tickets]);
			}
		}

		return [...state];
	}

	if (action.type === "UPDATE_TICKET") {
		const ticket = action.payload;
		const whatsappId = action.whatsappId;

		const ticketIndex = state.findIndex(t => t.id === ticket.id);
		if (ticketIndex !== -1) {
			state[ticketIndex] = ticket;
		} else if (ticket.whatsappId === whatsappId) {
			state.unshift(ticket);
		} else {
			const candidate = action.tickets.find(t => t.id === ticket.id);
			if (candidate) {
				Object.assign(candidate, ticket)
			} else {
				action.tickets.unshift(ticket);
			}

			action.setTickets([...action.tickets]);
		}

		return [...state];
	}

	if (action.type === "UPDATE_TICKET_UNREAD_MESSAGES") {
		const ticket = action.payload;
		const whatsappId = action.whatsappId;

		const ticketIndex = state.findIndex(t => t.id === ticket.id);
		if (ticketIndex !== -1) {
			state[ticketIndex] = ticket;
			state.unshift(state.splice(ticketIndex, 1)[0]);
		} else if (ticket.whatsappId === whatsappId) {
			state.unshift(ticket);
		} else {
			const candidate = action.tickets.find(t => t.id === ticket.id);
			if (candidate) {
				Object.assign(candidate, ticket)
			} else {
				action.tickets.unshift(ticket);
			}

			action.setTickets([...action.tickets]);
		}

		return [...state];
	}

	if (action.type === "UPDATE_TICKET_CONTACT") {
		const contact = action.payload;
		const ticketIndex = state.findIndex(t => t.contactId === contact.id);
		if (ticketIndex !== -1) {
			state[ticketIndex].contact = contact;
		} else {
			const candidate = action.tickets.find(t => t.contactId === contact.id);
			if (candidate) {
				candidate.contact = contact;
				action.setTickets([...action.tickets]);
			}
		}
		return [...state];
	}

	if (action.type === "DELETE_TICKET") {
		const ticketId = action.payload;
		const ticketIndex = state.findIndex(t => t.id === ticketId);
		if (ticketIndex !== -1) {
			state.splice(ticketIndex, 1);
		} else {
			const index = action.tickets.findIndex(t => t.id === ticketId);
			if (index !== -1) {
				action.tickets.splice(index, 1)
				action.setTickets([...action.tickets]);
			}
		}

		return [...state];
	}

	if (action.type === "RESET") {
		return [];
	}
};

const TicketsList = (props) => {
	const {whatsappId, status, searchParam, showAll, selectedQueueIds, updateCount, style} =
		props;
	const classes = useStyles();
	const [pageNumber, setPageNumber] = useState(1);
	const [ticketsList, dispatch] = useReducer(reducer, []);
	const {user} = useContext(AuthContext);

	useEffect(() => {
		dispatch({type: "RESET"});
		setPageNumber(1);
	}, [status, searchParam, dispatch, showAll, selectedQueueIds, whatsappId]);

	const {tickets, hasMore, loading, setTickets} = useTickets({
		pageNumber,
		searchParam,
		status,
		showAll,
		queueIds: JSON.stringify(selectedQueueIds),
	});

	useEffect(() => {
		if (!status && !searchParam && !whatsappId) return;
		dispatch({
			type: "LOAD_TICKETS",
			payload: tickets,
			whatsappId
		});
	}, [tickets, whatsappId]);

	useEffect(() => {
		const socket = openSocket();

		const shouldUpdateTicket = ticket => !searchParam &&
			(!ticket.userId || ticket.userId === user?.id || showAll) &&
			(!ticket.queueId || selectedQueueIds.indexOf(ticket.queueId) > -1);

		const notBelongsToUserQueues = ticket =>
			ticket.queueId && selectedQueueIds.indexOf(ticket.queueId) === -1;

		socket.on("connect", () => {
			if (status) {
				socket.emit("joinTickets", status);
			} else {
				socket.emit("joinNotification");
			}
		});

		socket.on("ticket", data => {
			if (data.action === "updateUnread") {
				dispatch({
					type: "RESET_UNREAD",
					payload: data.ticketId,
					tickets,
					setTickets
				});
			}

			if (data.action === "update" && shouldUpdateTicket(data.ticket)) {
				dispatch({
					type: "UPDATE_TICKET",
					payload: data.ticket,
					whatsappId,
					tickets,
					setTickets
				});
			}

			if (data.action === "update" && notBelongsToUserQueues(data.ticket)) {
				dispatch({type: "DELETE_TICKET", payload: data.ticket.id, tickets, setTickets});
			}

			if (data.action === "delete") {
				dispatch({type: "DELETE_TICKET", payload: data.ticketId, tickets, setTickets});
			}
		});

		socket.on("appMessage", data => {
			if (data.action === "create" && shouldUpdateTicket(data.ticket)) {
				dispatch({
					type: "UPDATE_TICKET_UNREAD_MESSAGES",
					payload: data.ticket,
					tickets,
					whatsappId,
					setTickets
				});
			}
		});

		socket.on("contact", data => {
			if (data.action === "update") {
				dispatch({
					type: "UPDATE_TICKET_CONTACT",
					payload: data.contact,
					tickets,
					whatsappId,
					setTickets
				});
			}
		});

		return () => {
			socket.disconnect();
		};
	}, [status, searchParam, showAll, user, selectedQueueIds, whatsappId]);

	useEffect(() => {
		if (typeof updateCount === "function") {
			const newCountObject = tickets.reduce((acc, ticket) => {
				if (!acc[ticket.whatsappId])
					acc[ticket.whatsappId] = 0;

				const candidate = ticketsList.find(el=>el.id === ticket.id);
				if (ticket.unreadMessages > 0 || candidate?.unreadMessages > 0)
					acc[ticket.whatsappId]++;

				return acc;
			}, {});

			updateCount({...newCountObject});
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [tickets, ticketsList]);

	const loadMore = () => {
		setPageNumber(prevState => prevState + 1);
	};

	const handleScroll = e => {
		if (!hasMore || loading) return;

		const {scrollTop, scrollHeight, clientHeight} = e.currentTarget;

		if (scrollHeight - (scrollTop + 100) < clientHeight) {
			e.currentTarget.scrollTop = scrollTop - 100;
			loadMore();
		}
	};

	return (
		<Paper className={classes.ticketsListWrapper} style={style}>
			<Paper
				square
				name="closed"
				elevation={0}
				className={classes.ticketsList}
				onScroll={handleScroll}
			>
				<List style={{paddingTop: 0}}>
					{ticketsList.length === 0 && !loading ? (
						<div className={classes.noTicketsDiv}>
							<span className={classes.noTicketsTitle}>
								{i18n.t("ticketsList.noTicketsTitle")}
							</span>
							<p className={classes.noTicketsText}>
								{i18n.t("ticketsList.noTicketsMessage")}
							</p>
						</div>
					) : (
						<>
							{ticketsList.map(ticket => (
								<TicketListItem ticket={ticket} key={ticket.id}/>
							))}
						</>
					)}
					{loading && <TicketsListSkeleton/>}
				</List>
			</Paper>
		</Paper>
	);
};

export default TicketsList;
