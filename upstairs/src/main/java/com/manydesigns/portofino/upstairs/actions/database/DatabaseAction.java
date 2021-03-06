package com.manydesigns.portofino.upstairs.actions.database;

import com.manydesigns.portofino.pageactions.AbstractPageAction;
import com.manydesigns.portofino.persistence.Persistence;
import com.manydesigns.portofino.security.RequiresAdministrator;
import org.apache.shiro.authz.annotation.RequiresAuthentication;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;

import javax.ws.rs.POST;
import javax.ws.rs.Path;

/**
 * @author Alessio Stalla - alessiostalla@gmail.com
 */
@RequiresAuthentication
@RequiresAdministrator
public class DatabaseAction extends AbstractPageAction {

    private static final Logger logger = LoggerFactory.getLogger(DatabaseAction.class);

}
